"""Dashboard KPIs + charts."""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta
from db import db
from auth import get_current, AuthContext

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(ctx: AuthContext = Depends(get_current)):
    tid = ctx.tenant_id
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    sixty_days_out = (now + timedelta(days=60)).isoformat()

    # Today's sales
    today_sales = await db.sales.find({"tenant_id": tid, "created_at": {"$gte": today_start}, "status": {"$ne": "refunded"}}, {"_id": 0}).to_list(1000)
    today_revenue = sum(s.get("total", 0) for s in today_sales)
    today_count = len(today_sales)

    # 30-day trend by day
    recent_sales = await db.sales.find({"tenant_id": tid, "created_at": {"$gte": thirty_days_ago}, "status": {"$ne": "refunded"}}, {"_id": 0}).to_list(5000)
    trend_by_day = {}
    for s in recent_sales:
        day = s["created_at"][:10]
        trend_by_day[day] = trend_by_day.get(day, 0) + s.get("total", 0)
    # fill days
    trend = []
    for i in range(29, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        trend.append({"date": d, "total": round(trend_by_day.get(d, 0), 2)})

    # Stock value
    levels = await db.stock_levels.find({"tenant_id": tid}, {"_id": 0}).to_list(5000)
    stock_value = sum(l.get("qty", 0) * l.get("avg_cost", 0) for l in levels)

    # Low stock count
    products = await db.products.find({"tenant_id": tid}, {"_id": 0}).to_list(5000)
    prod_map = {p["id"]: p for p in products}
    stock_by_prod = {}
    for lvl in levels:
        stock_by_prod[lvl["product_id"]] = stock_by_prod.get(lvl["product_id"], 0) + lvl.get("qty", 0)
    low_count = 0
    for p in products:
        if stock_by_prod.get(p["id"], 0) <= p.get("reorder_level", 10):
            low_count += 1

    # Expiring soon
    expiring = await db.batches.count_documents({
        "tenant_id": tid,
        "expiry_date": {"$lte": sixty_days_out, "$ne": None},
        "qty": {"$gt": 0},
    })

    # Pending POs
    pending_po = await db.purchase_orders.count_documents({"tenant_id": tid, "status": {"$in": ["draft", "sent", "partial"]}})

    # Top products (last 30 days)
    top = {}
    for s in recent_sales:
        for l in s["lines"]:
            key = l["product_id"]
            top[key] = top.get(key, {"product_id": key, "name": l["name"], "qty": 0, "revenue": 0})
            top[key]["qty"] += l["qty"]
            top[key]["revenue"] += l.get("line_total", l["qty"] * l["price"])
    top_products = sorted(top.values(), key=lambda x: x["revenue"], reverse=True)[:5]

    # Category mix
    cat_mix = {}
    for s in recent_sales:
        for l in s["lines"]:
            p = prod_map.get(l["product_id"])
            cat = (p or {}).get("category", "Uncategorized") or "Uncategorized"
            cat_mix[cat] = cat_mix.get(cat, 0) + l.get("line_total", l["qty"] * l["price"])
    category_mix = [{"category": k, "value": round(v, 2)} for k, v in sorted(cat_mix.items(), key=lambda x: -x[1])]

    return {
        "today_revenue": round(today_revenue, 2),
        "today_orders": today_count,
        "stock_value": round(stock_value, 2),
        "low_stock_count": low_count,
        "expiring_soon": expiring,
        "pending_pos": pending_po,
        "sales_trend": trend,
        "top_products": top_products,
        "category_mix": category_mix,
    }
