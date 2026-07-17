"""Razorpay POS payment collection.
Flow: cashier at POS → create Razorpay order for sale amount → customer pays via QR/UPI/card
→ frontend verifies signature → sale is finalized with payment_mode='razorpay'.
"""
import os
import hmac
import hashlib
import json
import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from db import db
from auth import get_current, AuthContext, require_roles
from models import now_iso, gen_id

router = APIRouter(prefix="/payments/razorpay", tags=["payments"])


def _get_client():
    """Lazily construct the Razorpay client so missing env vars don't crash import."""
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        return None, key_id, key_secret
    try:
        client = razorpay.Client(auth=(key_id, key_secret))
        return client, key_id, key_secret
    except Exception:
        return None, key_id, key_secret


class CreateOrderIn(BaseModel):
    amount: float           # rupees (float, we'll convert to paise)
    receipt: str = ""       # optional short receipt string (≤40 chars)
    notes: dict = {}


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.get("/config")
async def config(ctx: AuthContext = Depends(get_current)):
    """Expose the public key ID to the frontend (Checkout.js needs it)."""
    _, key_id, _ = _get_client()
    return {"key_id": key_id}


@router.post("/order")
async def create_order(inp: CreateOrderIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "cashier"))):
    client, key_id, _ = _get_client()
    if not client:
        raise HTTPException(503, "Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET")
    amount_paise = int(round(inp.amount * 100))
    if amount_paise <= 0:
        raise HTTPException(400, "Amount must be positive")

    receipt = (inp.receipt or f"pos-{gen_id()[:8]}")[:40]

    try:
        order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": {**inp.notes, "tenant_id": ctx.tenant_id, "user_id": ctx.user_id},
            "payment_capture": 1,
        })
    except Exception as e:
        raise HTTPException(500, f"Razorpay order failed: {e}")

    # Persist for audit
    await db.razorpay_orders.insert_one({
        "id": order["id"],
        "tenant_id": ctx.tenant_id,
        "user_id": ctx.user_id,
        "amount": inp.amount,
        "amount_paise": amount_paise,
        "receipt": receipt,
        "status": "created",
        "created_at": now_iso(),
    })

    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": key_id,
    }


@router.post("/verify")
async def verify(inp: VerifyIn, ctx: AuthContext = Depends(get_current)):
    """Verify HMAC-SHA256 signature returned by Razorpay Checkout."""
    _, _, key_secret = _get_client()
    if not key_secret:
        raise HTTPException(503, "Razorpay not configured")
    body = f"{inp.razorpay_order_id}|{inp.razorpay_payment_id}".encode()
    expected = hmac.new(key_secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, inp.razorpay_signature):
        raise HTTPException(400, "Signature verification failed")

    await db.razorpay_orders.update_one(
        {"id": inp.razorpay_order_id, "tenant_id": ctx.tenant_id},
        {"$set": {"status": "paid", "razorpay_payment_id": inp.razorpay_payment_id, "paid_at": now_iso()}},
    )
    return {"verified": True, "razorpay_payment_id": inp.razorpay_payment_id}


@router.post("/webhook")
async def webhook(request: Request):
    """Optional: async webhook for cases where user closes browser mid-payment.
    Configure in Razorpay Dashboard → Webhooks → set URL + secret."""
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET")
    if not secret:
        return {"skipped": "no webhook secret configured"}

    payload = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Invalid webhook signature")

    try:
        data = json.loads(payload)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")
    event = data.get("event")
    entity = data.get("payload", {}).get("payment", {}).get("entity", {})
    if event == "payment.captured":
        order_id = entity.get("order_id")
        await db.razorpay_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "paid", "razorpay_payment_id": entity.get("id"), "paid_at": now_iso()}},
        )
        # Best-effort: mark any sale referencing this order_id as paid too
        await db.sales.update_many(
            {"razorpay_order_id": order_id},
            {"$set": {"status": "paid", "razorpay_payment_id": entity.get("id")}},
        )
    elif event == "payment.failed":
        await db.razorpay_orders.update_one(
            {"id": entity.get("order_id")},
            {"$set": {"status": "failed", "failed_reason": entity.get("error_description", "")}},
        )
    return {"ok": True}
