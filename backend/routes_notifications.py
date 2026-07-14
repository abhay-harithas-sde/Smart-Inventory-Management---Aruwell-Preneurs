"""Twilio SMS + WhatsApp notifications.
Use cases:
- WhatsApp low-stock alert to owner (on-demand or scheduled)
- WhatsApp daily P&L summary
- SMS receipt to customer after POS checkout
"""
import os
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import db
from auth import get_current, AuthContext, require_roles
from models import now_iso

router = APIRouter(prefix="/notify", tags=["notify"])

_sid = os.environ["TWILIO_ACCOUNT_SID"]
_token = os.environ["TWILIO_AUTH_TOKEN"]
_from_sms = os.environ["TWILIO_PHONE_NUMBER"]
_from_wa = os.environ["TWILIO_WHATSAPP_FROM"]

_client = Client(_sid, _token)


class SMSIn(BaseModel):
    to: str                # E.164 like +919876543210
    body: str


class WhatsAppIn(BaseModel):
    to: str                # E.164 (backend adds whatsapp: prefix)
    body: str


def _send_sms(to: str, body: str) -> str:
    msg = _client.messages.create(from_=_from_sms, to=to, body=body)
    return msg.sid


def _send_whatsapp(to: str, body: str) -> str:
    to_wa = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
    msg = _client.messages.create(from_=_from_wa, to=to_wa, body=body)
    return msg.sid


@router.post("/sms")
async def send_sms(inp: SMSIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "cashier"))):
    try:
        sid = _send_sms(inp.to, inp.body)
    except TwilioRestException as e:
        raise HTTPException(400, f"Twilio: {e.msg}")
    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "sms", "to": inp.to, "body": inp.body,
        "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid}


@router.post("/whatsapp")
async def send_whatsapp(inp: WhatsAppIn, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    try:
        sid = _send_whatsapp(inp.to, inp.body)
    except TwilioRestException as e:
        raise HTTPException(400, f"Twilio: {e.msg}")
    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "whatsapp", "to": inp.to, "body": inp.body,
        "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid}


@router.post("/low-stock-digest")
async def send_low_stock_digest(inp: WhatsAppIn, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    """Compose + send a WhatsApp digest of low-stock products."""
    products = await db.products.find({"tenant_id": ctx.tenant_id}, {"_id": 0}).to_list(2000)
    lows = []
    for p in products:
        levels = await db.stock_levels.find({"tenant_id": ctx.tenant_id, "product_id": p["id"]}, {"_id": 0}).to_list(20)
        total = sum(l.get("qty", 0) for l in levels)
        if total <= p.get("reorder_level", 10):
            lows.append(f"• {p['name']} — stock: {total} (reorder ≤ {p.get('reorder_level', 10)})")

    if not lows:
        body = "✅ ATH ERP: All products are above reorder level. Nothing to worry about today."
    else:
        body = "⚠️ ATH ERP low-stock alert:\n\n" + "\n".join(lows[:15])
        if len(lows) > 15:
            body += f"\n\n…and {len(lows) - 15} more."

    try:
        sid = _send_whatsapp(inp.to, body)
    except TwilioRestException as e:
        raise HTTPException(400, f"Twilio: {e.msg}")

    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "whatsapp", "kind": "low_stock_digest",
        "to": inp.to, "body": body, "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid, "low_count": len(lows)}


@router.post("/daily-pnl")
async def send_daily_pnl(inp: WhatsAppIn, ctx: AuthContext = Depends(require_roles("owner"))):
    """Compose + send a WhatsApp daily P&L summary."""
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sales = await db.sales.find(
        {"tenant_id": ctx.tenant_id, "created_at": {"$gte": today}, "status": {"$ne": "refunded"}},
        {"_id": 0}
    ).to_list(5000)
    revenue = sum(s.get("total", 0) for s in sales)
    orders = len(sales)
    tax = sum(s.get("tax", 0) for s in sales)

    body = (
        f"📊 ATH Daily Summary — {today}\n"
        f"Orders: {orders}\n"
        f"Revenue: ₹{revenue:,.2f}\n"
        f"Tax collected: ₹{tax:,.2f}"
    )
    try:
        sid = _send_whatsapp(inp.to, body)
    except TwilioRestException as e:
        raise HTTPException(400, f"Twilio: {e.msg}")
    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "whatsapp", "kind": "daily_pnl",
        "to": inp.to, "body": body, "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid}


class InvoiceWhatsAppIn(BaseModel):
    sale_id: str
    to: str            # E.164 like +919876543210


@router.post("/whatsapp/invoice")
async def send_invoice_whatsapp(inp: InvoiceWhatsAppIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "cashier"))):
    """Compose an invoice from a sale and send via WhatsApp."""
    sale = await db.sales.find_one({"tenant_id": ctx.tenant_id, "id": inp.sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(404, "Sale not found")

    tenant = await db.tenants.find_one({"id": ctx.tenant_id}, {"_id": 0})
    store_name = (tenant or {}).get("name", "Your Store")

    lines_txt = "\n".join(
        f"• {l['qty']}× {l['name']} — ₹{l.get('line_total', l['qty'] * l['price']):.2f}"
        for l in sale["lines"][:20]
    )
    if len(sale["lines"]) > 20:
        lines_txt += f"\n…and {len(sale['lines']) - 20} more items"

    body = (
        f"🧾 *{store_name}*\n"
        f"Invoice: {sale['invoice_no']}\n"
        f"Customer: {sale.get('customer_name') or 'Walk-in'}\n\n"
        f"{lines_txt}\n\n"
        f"Subtotal: ₹{sale['subtotal']:.2f}\n"
        f"Tax (GST): ₹{sale['tax']:.2f}\n"
        f"*Total: ₹{sale['total']:.2f}*\n"
        f"Paid via {sale['payment_mode'].upper()}\n\n"
        f"Thank you for your business!"
    )

    try:
        sid = _send_whatsapp(inp.to, body)
    except TwilioRestException as e:
        raise HTTPException(400, f"Twilio: {e.msg}")

    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "whatsapp", "kind": "invoice",
        "sale_id": inp.sale_id, "invoice_no": sale["invoice_no"],
        "to": inp.to, "body": body, "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid, "invoice_no": sale["invoice_no"]}


@router.get("/history")
async def list_notifications(ctx: AuthContext = Depends(get_current)):
    return await db.notifications.find(
        {"tenant_id": ctx.tenant_id}, {"_id": 0}
    ).sort("sent_at", -1).limit(100).to_list(100)
