"""AI: NLQ (natural language → Mongo aggregation), demand forecasting, reorder suggestions."""
import os
import json
import re
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from db import db
from auth import get_current, AuthContext
from models import NLQIn

from openai import AsyncOpenAI, RateLimitError, AuthenticationError
import google.generativeai as genai

router = APIRouter(prefix="/ai", tags=["ai"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", None)

# Max tokens per request to stay within buildathon limits
MAX_TOKENS = 1000


async def _call_gemini(system: str, user: str) -> str:
    """Call Gemini as a fallback when OpenAI auth fails."""
    if not GEMINI_API_KEY:
        raise HTTPException(503, "AI service unavailable — no valid API key configured")
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=system,
    )
    resp = model.generate_content(user)
    return resp.text


# Shim: wraps AsyncOpenAI so existing call-sites work unchanged
class UserMessage:
    def __init__(self, text: str):
        self.text = text

class LlmChat:
    def __init__(self, api_key: str, session_id: str = "", system_message: str = ""):
        kwargs = {"api_key": api_key}
        if LLM_BASE_URL:
            kwargs["base_url"] = LLM_BASE_URL
        self._client = AsyncOpenAI(**kwargs)
        self._system = system_message
        self._model = LLM_MODEL

    def with_model(self, provider: str, model: str) -> "LlmChat":
        return self

    async def send_message(self, msg: UserMessage) -> str:
        messages = []
        if self._system:
            messages.append({"role": "system", "content": self._system})
        messages.append({"role": "user", "content": msg.text})
        try:
            resp = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                max_tokens=MAX_TOKENS,
            )
            return resp.choices[0].message.content or ""
        except RateLimitError:
            raise HTTPException(429, "AI rate limit reached. Please wait a moment and try again.")
        except AuthenticationError:
            # OpenAI key invalid — transparently fall back to Gemini
            return await _call_gemini(self._system, msg.text)
        except Exception as e:
            raise HTTPException(500, f"AI service error: {str(e)[:200]}")

SCHEMA_DESCRIPTION = """
You are a MongoDB aggregation query generator for a multi-tenant ERP.
Every query MUST include a $match with tenant_id = "__TENANT_ID__" as the FIRST stage.
Collections and fields:
- sales: {tenant_id, id, invoice_no, created_at (ISO string), total, subtotal, tax,
         customer_name, location_id, payment_mode, status,
         lines: [{product_id, name, sku, qty, price, tax_rate, line_total}]}
- products: {tenant_id, id, sku, name, category, price, cost, reorder_level}
- stock_levels: {tenant_id, product_id, location_id, qty, avg_cost}
- stock_movements: {tenant_id, product_id, location_id, qty, kind, unit_cost, created_at}
- suppliers: {tenant_id, id, name}
- purchase_orders: {tenant_id, id, po_no, supplier_name, status, total, created_at}
- expenses: {tenant_id, category, amount, date}
- customers: {tenant_id, id, name, phone}

Rules:
- Return STRICT JSON: {"collection": "<name>", "pipeline": [ ... ], "chart": "table|bar|line|pie", "explanation": "..."}
- created_at is an ISO-8601 STRING. Use $gte / $lte with string dates.
- To sum sales line items, use $unwind on "lines".
- Never write to the database. Read-only aggregation only.
- Limit results to 50 documents unless the user says otherwise.
- Return JSON ONLY. No markdown, no code fences.
"""


def _extract_json(text: str) -> dict:
    """Robust JSON extraction from LLM response."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    # find first { and matching last }
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def _sanitize_pipeline(pipeline: list, tenant_id: str) -> list:
    """Ensure tenant_id is enforced in the first $match; strip any writes/dangerous stages."""
    banned = {"$out", "$merge"}
    safe = []
    for stage in pipeline:
        if not isinstance(stage, dict):
            continue
        key = next(iter(stage.keys()), "")
        if key in banned:
            continue
        safe.append(stage)
    # Always inject tenant_id match upfront
    return [{"$match": {"tenant_id": tenant_id}}] + safe


@router.post("/nlq")
async def nlq(inp: NLQIn, ctx: AuthContext = Depends(get_current)):
    system = SCHEMA_DESCRIPTION.replace("__TENANT_ID__", ctx.tenant_id)
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"nlq-{ctx.tenant_id}-{ctx.user_id}",
        system_message=system,
    ).with_model("openai", LLM_MODEL)

    try:
        resp = await chat.send_message(UserMessage(text=inp.question))
        raw = resp if isinstance(resp, str) else str(resp)
        parsed = _extract_json(raw)
    except Exception as e:
        raise HTTPException(500, f"NLQ generation failed: {e}")

    collection_name = parsed.get("collection")
    pipeline = parsed.get("pipeline", [])
    chart = parsed.get("chart", "table")
    explanation = parsed.get("explanation", "")

    allowed = {"sales", "products", "stock_levels", "stock_movements", "suppliers", "purchase_orders", "expenses", "customers"}
    if collection_name not in allowed:
        raise HTTPException(400, f"Collection '{collection_name}' not allowed")

    pipeline = _sanitize_pipeline(pipeline, ctx.tenant_id)
    pipeline.append({"$limit": 200})

    try:
        cursor = db[collection_name].aggregate(pipeline)
        rows = await cursor.to_list(200)
        for r in rows:
            r.pop("_id", None)
    except Exception as e:
        raise HTTPException(500, f"Query execution failed: {e}")

    return {
        "question": inp.question,
        "explanation": explanation,
        "chart": chart,
        "rows": rows,
        "row_count": len(rows),
        "pipeline": pipeline,
        "collection": collection_name,
    }


@router.get("/forecast")
async def forecast(ctx: AuthContext = Depends(get_current)):
    """Per-SKU 30-day forecast: simple moving avg + last-week seasonality."""
    tid = ctx.tenant_id
    now = datetime.now(timezone.utc)
    sixty_days_ago = (now - timedelta(days=60)).isoformat()

    sales = await db.sales.find(
        {"tenant_id": tid, "created_at": {"$gte": sixty_days_ago}, "status": {"$ne": "refunded"}},
        {"_id": 0}
    ).to_list(10000)

    # aggregate qty per product per day
    per_prod = {}
    for s in sales:
        day = s["created_at"][:10]
        for l in s["lines"]:
            pid = l["product_id"]
            per_prod.setdefault(pid, {"name": l["name"], "sku": l["sku"], "days": {}})
            per_prod[pid]["days"][day] = per_prod[pid]["days"].get(day, 0) + l["qty"]

    products = await db.products.find({"tenant_id": tid}, {"_id": 0}).to_list(5000)
    prod_map = {p["id"]: p for p in products}

    # current stock
    levels = await db.stock_levels.find({"tenant_id": tid}, {"_id": 0}).to_list(5000)
    stock_by_prod = {}
    for lvl in levels:
        stock_by_prod[lvl["product_id"]] = stock_by_prod.get(lvl["product_id"], 0) + lvl.get("qty", 0)

    forecasts = []
    for pid, data in per_prod.items():
        days = data["days"]
        total = sum(days.values())
        avg_daily = total / 60.0  # sold over 60 days
        forecast_30d = round(avg_daily * 30, 2)
        product = prod_map.get(pid, {})
        current_stock = stock_by_prod.get(pid, 0)
        lead = product.get("lead_time_days", 7)
        reorder_qty = max(0, round(forecast_30d - current_stock + (avg_daily * lead), 0))
        forecasts.append({
            "product_id": pid,
            "name": data["name"],
            "sku": data["sku"],
            "sold_60d": total,
            "avg_daily": round(avg_daily, 2),
            "forecast_30d": forecast_30d,
            "current_stock": current_stock,
            "reorder_qty": reorder_qty,
            "reorder_level": product.get("reorder_level", 10),
        })

    forecasts.sort(key=lambda x: -x["forecast_30d"])
    return {"forecasts": forecasts[:50]}


@router.get("/insights")
async def insights(ctx: AuthContext = Depends(get_current)):
    """Quick LLM-generated business narrative."""
    # gather quick metrics
    sales = await db.sales.find({"tenant_id": ctx.tenant_id, "status": {"$ne": "refunded"}}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    total_30d = sum(s.get("total", 0) for s in sales)
    order_count = len(sales)

    top = {}
    for s in sales:
        for l in s["lines"]:
            top[l["name"]] = top.get(l["name"], 0) + l.get("line_total", 0)
    top_list = sorted(top.items(), key=lambda x: -x[1])[:5]

    context = f"Recent sales: {order_count} orders, revenue ₹{total_30d:.2f}. Top products: {top_list}."

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"insights-{ctx.tenant_id}",
        system_message="You are an ERP business analyst. Reply in 3-4 short bullet points with actionable insights. No preamble.",
    ).with_model("openai", LLM_MODEL)

    try:
        resp = await chat.send_message(UserMessage(text=context))
        text = resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        text = f"AI insights unavailable: {e}"

    return {"narrative": text}
