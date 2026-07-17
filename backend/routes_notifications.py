"""Twilio SMS + WhatsApp (template-based) notifications.

SMS  — works for verified numbers on trial accounts.
WhatsApp — uses pre-approved Twilio Content Templates for business-initiated
           messages. Once the customer replies, free-form messages work for 24h.
"""
import os
import json
import functools
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import db
from auth import get_current, AuthContext, require_roles
from models import now_iso

router = APIRouter(prefix="/notify", tags=["notify"])

# ── Twilio error codes ────────────────────────────────────────────────────────
_TRIAL_UNVERIFIED_CODE = 21608   # number not verified on trial account
_TRIAL_REGION_CODE     = 21215   # region not enabled
_SAME_FROM_TO_CODE     = 21266   # To == From

# ── Pre-approved WhatsApp Content Template SIDs ───────────────────────────────
# Add more from https://console.twilio.com/us1/develop/sms/content-template-builder
_WA_TEMPLATES = {
    "appointment": os.environ.get("TWILIO_WA_TEMPLATE_APPOINTMENT", "HXb5b62575e6e4ff6129ad7c8efe1f983e"),
    "order":       os.environ.get("TWILIO_WA_TEMPLATE_ORDER",       "HX350d429d32e64a552466cafecbe95f3c"),
}


@functools.lru_cache(maxsize=1)
def _get_twilio_client():
    sid   = os.environ["TWILIO_ACCOUNT_SID"]
    token = os.environ["TWILIO_AUTH_TOKEN"]
    from_sms = os.environ["TWILIO_PHONE_NUMBER"]
    from_wa  = os.environ["TWILIO_WHATSAPP_FROM"]   # whatsapp:+14155238886
    return Client(sid, token), from_sms, from_wa


def _friendly_twilio_error(e: TwilioRestException) -> HTTPException:
    code = getattr(e, "code", None)
    if code == _TRIAL_UNVERIFIED_CODE:
        return HTTPException(
            400,
            "Twilio trial restriction: number is not verified. "
            "Add it at https://www.twilio.com/console/phone-numbers/verified "
            "or upgrade your Twilio account."
        )
    if code == _TRIAL_REGION_CODE:
        return HTTPException(
            400,
            "Twilio trial restriction: region not enabled. "
            "Verify the number at https://www.twilio.com/console/phone-numbers/verified."
        )
    if code == _SAME_FROM_TO_CODE:
        return HTTPException(400, "The 'To' number cannot be the same as your Twilio sender number.")
    return HTTPException(400, f"Twilio error ({code}): {e.msg}")


def _validate_e164(number: str):
    if not number.startswith("+"):
        raise HTTPException(422, "Phone number must be in E.164 format, e.g. +919876543210")


# ── Internal helpers ──────────────────────────────────────────────────────────

def _send_sms(to: str, body: str) -> str:
    """Send a plain SMS. Returns message SID."""
    _validate_e164(to)
    client, from_sms, _ = _get_twilio_client()
    msg = client.messages.create(from_=from_sms, to=to, body=body)
    return msg.sid


def _send_whatsapp_template(to: str, content_sid: str, variables: dict) -> str:
    """Send a business-initiated WhatsApp message using a pre-approved template.

    Uses Twilio Content API (content_sid + content_variables).
    The recipient does NOT need to opt-in first for template messages.
    """
    _validate_e164(to)
    client, _, from_wa = _get_twilio_client()
    to_wa = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
    msg = client.messages.create(
        from_=from_wa,
        to=to_wa,
        content_sid=content_sid,
        content_variables=json.dumps(variables),
    )
    return msg.sid


def _send_whatsapp_freeform(to: str, body: str) -> str:
    """Send a free-form WhatsApp message.
    Only works within 24h of the customer's last reply (session window).
    """
    _validate_e164(to)
    client, _, from_wa = _get_twilio_client()
    to_wa = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
    msg = client.messages.create(from_=from_wa, to=to_wa, body=body)
    return msg.sid


# ── Models ────────────────────────────────────────────────────────────────────

class SMSIn(BaseModel):
    to: str
    body: str


class AlertIn(BaseModel):
    to: str                      # E.164


class InvoiceSMSIn(BaseModel):
    sale_id: str
    to: str


class WATemplateIn(BaseModel):
    to: str                      # E.164
    template: str                # key from _WA_TEMPLATES, e.g. "appointment"
    variables: dict              # {"1": "value1", "2": "value2"}


class WAFreeformIn(BaseModel):
    to: str
    body: str


class OrderNotifyIn(BaseModel):
    to: str           # E.164, e.g. +919611462389
    date: str         # delivery date, e.g. "25 Jul 2026"
    time: str         # delivery time, e.g. "3:00 PM"


# ═══════════════════════════════════════════════════════════════════════════════
# SMS ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/sms")
async def send_sms(inp: SMSIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "cashier"))):
    """Send a plain SMS to any verified E.164 number."""
    try:
        sid = _send_sms(inp.to, inp.body)
    except TwilioRestException as e:
        raise _friendly_twilio_error(e)
    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "sms", "to": inp.to,
        "body": inp.body, "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid}


@router.post("/low-stock-alert")
async def send_low_stock_alert(inp: AlertIn, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    """Compose a low-stock digest and send via SMS."""
    products = await db.products.find({"tenant_id": ctx.tenant_id}, {"_id": 0}).to_list(2000)
    lows = []
    for p in products:
        levels = await db.stock_levels.find(
            {"tenant_id": ctx.tenant_id, "product_id": p["id"]}, {"_id": 0}
        ).to_list(20)
        total = sum(l.get("qty", 0) for l in levels)
        if total <= p.get("reorder_level", 10):
            lows.append(f"{p['name']}: {int(total)} left (reorder<={p.get('reorder_level', 10)})")

    if not lows:
        body = "Smart Ledger: All products are above reorder level."
    else:
        items = "\n".join(lows[:10])
        suffix = f"\n+{len(lows) - 10} more." if len(lows) > 10 else ""
        body = f"Smart Ledger LOW STOCK ALERT:\n{items}{suffix}"

    try:
        sid = _send_sms(inp.to, body)
    except TwilioRestException as e:
        raise _friendly_twilio_error(e)

    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "sms", "kind": "low_stock_alert",
        "to": inp.to, "body": body, "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid, "low_count": len(lows)}


@router.post("/daily-summary")
async def send_daily_summary(inp: AlertIn, ctx: AuthContext = Depends(require_roles("owner"))):
    """Compose today's P&L summary and send via SMS."""
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sales = await db.sales.find(
        {"tenant_id": ctx.tenant_id, "created_at": {"$gte": today}, "status": {"$ne": "refunded"}},
        {"_id": 0}
    ).to_list(5000)
    revenue = sum(s.get("total", 0) for s in sales)
    orders  = len(sales)
    tax     = sum(s.get("tax", 0) for s in sales)

    body = (
        f"Smart Ledger Summary {today}\n"
        f"Orders: {orders}\n"
        f"Revenue: Rs.{revenue:,.2f}\n"
        f"Tax collected: Rs.{tax:,.2f}"
    )
    try:
        sid = _send_sms(inp.to, body)
    except TwilioRestException as e:
        raise _friendly_twilio_error(e)

    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "sms", "kind": "daily_summary",
        "to": inp.to, "body": body, "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid}


@router.post("/invoice")
async def send_invoice_sms(inp: InvoiceSMSIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "cashier"))):
    """Send a sale invoice summary via SMS."""
    sale = await db.sales.find_one({"tenant_id": ctx.tenant_id, "id": inp.sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(404, "Sale not found")

    tenant = await db.tenants.find_one({"id": ctx.tenant_id}, {"_id": 0})
    store  = (tenant or {}).get("name", "Smart Ledger")

    lines = sale["lines"]
    items = ", ".join(f"{l['qty']}x {l['name']}" for l in lines[:5])
    if len(lines) > 5:
        items += f" +{len(lines) - 5} more"

    body = (
        f"{store}\n"
        f"Invoice: {sale['invoice_no']}\n"
        f"Items: {items}\n"
        f"Total: Rs.{sale['total']:.2f}\n"
        f"Paid via {sale['payment_mode'].upper()}\n"
        f"Thank you!"
    )
    try:
        sid = _send_sms(inp.to, body)
    except TwilioRestException as e:
        raise _friendly_twilio_error(e)

    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "sms", "kind": "invoice",
        "sale_id": inp.sale_id, "invoice_no": sale["invoice_no"],
        "to": inp.to, "body": body, "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid, "invoice_no": sale["invoice_no"]}


# ═══════════════════════════════════════════════════════════════════════════════
# WHATSAPP ROUTES (template-based business-initiated messages)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/whatsapp/template")
async def send_whatsapp_template(
    inp: WATemplateIn,
    ctx: AuthContext = Depends(require_roles("owner", "manager")),
):
    """Send a business-initiated WhatsApp message using a pre-approved template.

    Templates are pre-approved by WhatsApp/Twilio so no customer opt-in needed.

    Available templates:
    - "appointment" → variables: {"1": "<date>", "2": "<time>"}
      Sends: "Your appointment is coming up on <date> at <time>."

    Example body:
        {"to": "+919611462389", "template": "appointment", "variables": {"1": "25 Jul", "2": "3:00 PM"}}
    """
    content_sid = _WA_TEMPLATES.get(inp.template)
    if not content_sid:
        available = list(_WA_TEMPLATES.keys())
        raise HTTPException(400, f"Unknown template '{inp.template}'. Available: {available}")

    try:
        sid = _send_whatsapp_template(inp.to, content_sid, inp.variables)
    except TwilioRestException as e:
        raise _friendly_twilio_error(e)

    # Build a preview of what was sent for the log
    body_preview = f"[WA template:{inp.template}] vars={inp.variables}"
    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "whatsapp", "kind": f"template:{inp.template}",
        "to": inp.to, "body": body_preview,
        "content_sid": content_sid, "variables": inp.variables,
        "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid, "template": inp.template, "content_sid": content_sid}


@router.post("/whatsapp/order")
async def send_whatsapp_order(
    inp: OrderNotifyIn,
    ctx: AuthContext = Depends(require_roles("owner", "manager", "cashier")),
):
    """Send a business-initiated order delivery notification via WhatsApp template.

    Uses the pre-approved 'Order Notifications' template:
      "Thank you for your order. Your delivery is scheduled for {{1}} at {{2}}.
       If you need to change it, please reply back and let us know."

    Example body:
        {"to": "+919611462389", "date": "25 Jul 2026", "time": "3:00 PM"}
    """
    content_sid = _WA_TEMPLATES["order"]
    variables   = {"1": inp.date, "2": inp.time}
    try:
        sid = _send_whatsapp_template(inp.to, content_sid, variables)
    except TwilioRestException as e:
        raise _friendly_twilio_error(e)

    body_preview = (
        f"Thank you for your order. Your delivery is scheduled for "
        f"{inp.date} at {inp.time}. If you need to change it, please reply back and let us know."
    )
    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "whatsapp", "kind": "order_notification",
        "to": inp.to, "body": body_preview,
        "content_sid": content_sid, "variables": variables,
        "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid, "message": body_preview}


@router.post("/whatsapp/freeform")
async def send_whatsapp_freeform(
    inp: WAFreeformIn,
    ctx: AuthContext = Depends(require_roles("owner", "manager", "cashier")),
):
    """Send a free-form WhatsApp message.

    Only works within the 24-hour session window after the customer last replied.
    Use /whatsapp/template to start a new conversation.
    """
    try:
        sid = _send_whatsapp_freeform(inp.to, inp.body)
    except TwilioRestException as e:
        raise _friendly_twilio_error(e)

    await db.notifications.insert_one({
        "tenant_id": ctx.tenant_id, "channel": "whatsapp", "kind": "freeform",
        "to": inp.to, "body": inp.body, "provider_sid": sid, "sent_at": now_iso(),
    })
    return {"sent": True, "sid": sid}


@router.get("/whatsapp/templates")
async def list_wa_templates(ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    """List available pre-approved WhatsApp templates."""
    return {
        "templates": [
            {
                "key": "appointment",
                "content_sid": _WA_TEMPLATES["appointment"],
                "description": "Appointment reminder",
                "message": "Your appointment is coming up on {{1}} at {{2}}.",
                "variables": {"1": "date (e.g. 25 Jul)", "2": "time (e.g. 3:00 PM)"},
                "endpoint": "/notify/whatsapp/template",
            },
            {
                "key": "order",
                "content_sid": _WA_TEMPLATES["order"],
                "description": "Order delivery notification",
                "message": "Thank you for your order. Your delivery is scheduled for {{1}} at {{2}}. If you need to change it, please reply back and let us know.",
                "variables": {"1": "date (e.g. 25 Jul 2026)", "2": "time (e.g. 3:00 PM)"},
                "endpoint": "/notify/whatsapp/order",
            },
        ]
    }


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITY ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/verified-numbers")
async def list_verified_numbers(ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    """List numbers verified on this Twilio trial account.
    Trial accounts can only send SMS to these numbers.
    WhatsApp templates work for any number regardless.
    """
    try:
        client, _, _ = _get_twilio_client()
        records  = client.outgoing_caller_ids.list(limit=50)
        verified = [{"phone_number": r.phone_number, "friendly_name": r.friendly_name} for r in records]
    except TwilioRestException as e:
        raise _friendly_twilio_error(e)
    except Exception as e:
        raise HTTPException(500, f"Could not fetch verified numbers: {e}")
    return {"verified_numbers": verified, "count": len(verified)}


@router.get("/history")
async def list_notifications(ctx: AuthContext = Depends(get_current)):
    """Return last 100 notifications sent by this tenant."""
    return await db.notifications.find(
        {"tenant_id": ctx.tenant_id}, {"_id": 0}
    ).sort("sent_at", -1).limit(100).to_list(100)
