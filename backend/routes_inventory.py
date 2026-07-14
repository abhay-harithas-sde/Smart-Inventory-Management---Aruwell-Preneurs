"""Products, categories, locations, batches, stock levels."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from db import db, scope
from auth import get_current, AuthContext, require_roles
from models import Product, ProductIn, Location, Category, Batch, StockLevel, StockMovement, now_iso, gen_id

router = APIRouter(prefix="/inventory", tags=["inventory"])


# ----- Locations -----
@router.get("/locations")
async def list_locations(ctx: AuthContext = Depends(get_current)):
    return await db.locations.find(scope(ctx.tenant_id), {"_id": 0}).to_list(200)


@router.post("/locations")
async def create_location(body: dict, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    loc = Location(tenant_id=ctx.tenant_id, name=body["name"], address=body.get("address", ""))
    await db.locations.insert_one(loc.model_dump())
    return loc.model_dump()


# ----- Categories -----
@router.get("/categories")
async def list_categories(ctx: AuthContext = Depends(get_current)):
    return await db.categories.find(scope(ctx.tenant_id), {"_id": 0}).to_list(500)


@router.post("/categories")
async def create_category(body: dict, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    c = Category(tenant_id=ctx.tenant_id, name=body["name"])
    await db.categories.insert_one(c.model_dump())
    return c.model_dump()


# ----- Products -----
@router.get("/products")
async def list_products(q: Optional[str] = None, ctx: AuthContext = Depends(get_current)):
    query = scope(ctx.tenant_id)
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}},
            {"barcode": {"$regex": q, "$options": "i"}},
        ]
    products = await db.products.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    # Batch-fetch all stock levels for this tenant once, then build lookup maps in memory
    all_levels = await db.stock_levels.find({"tenant_id": ctx.tenant_id}, {"_id": 0}).to_list(10000)
    totals = {}
    by_loc = {}
    for l in all_levels:
        pid = l["product_id"]
        qty = l.get("qty", 0)
        totals[pid] = totals.get(pid, 0) + qty
        by_loc.setdefault(pid, {})[l["location_id"]] = qty
    for p in products:
        p["stock"] = totals.get(p["id"], 0)
        p["stock_by_location"] = by_loc.get(p["id"], {})
    return products


@router.get("/products/{pid}")
async def get_product(pid: str, ctx: AuthContext = Depends(get_current)):
    p = await db.products.find_one({"tenant_id": ctx.tenant_id, "id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    return p


@router.post("/products")
async def create_product(inp: ProductIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "warehouse"))):
    if await db.products.find_one({"tenant_id": ctx.tenant_id, "sku": inp.sku}):
        raise HTTPException(400, "SKU already exists")
    p = Product(tenant_id=ctx.tenant_id, **inp.model_dump())
    await db.products.insert_one(p.model_dump())
    return p.model_dump()


@router.put("/products/{pid}")
async def update_product(pid: str, inp: ProductIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "warehouse"))):
    r = await db.products.update_one({"tenant_id": ctx.tenant_id, "id": pid}, {"$set": inp.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.products.find_one({"tenant_id": ctx.tenant_id, "id": pid}, {"_id": 0})


@router.delete("/products/{pid}")
async def delete_product(pid: str, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    await db.products.delete_one({"tenant_id": ctx.tenant_id, "id": pid})
    return {"ok": True}


# ----- Stock adjustment -----
@router.post("/adjust")
async def adjust_stock(body: dict, ctx: AuthContext = Depends(require_roles("owner", "manager", "warehouse"))):
    pid = body["product_id"]
    lid = body["location_id"]
    qty = float(body["qty"])
    note = body.get("note", "manual adjustment")
    await _apply_movement(ctx.tenant_id, pid, lid, qty, "adjustment", "", note, unit_cost=body.get("cost", 0))
    return {"ok": True}


# ----- Alerts -----
@router.get("/alerts")
async def alerts(ctx: AuthContext = Depends(get_current)):
    # Batch-fetch all stock levels once, build product_id -> total_stock map
    all_levels = await db.stock_levels.find({"tenant_id": ctx.tenant_id}, {"_id": 0}).to_list(10000)
    stock_map = {}
    for l in all_levels:
        stock_map[l["product_id"]] = stock_map.get(l["product_id"], 0) + l.get("qty", 0)

    products = await db.products.find(scope(ctx.tenant_id), {"_id": 0}).to_list(2000)
    low = []
    for p in products:
        total = stock_map.get(p["id"], 0)
        if total <= p.get("reorder_level", 10):
            low.append({"product_id": p["id"], "name": p["name"], "sku": p["sku"], "stock": total, "reorder_level": p.get("reorder_level", 10)})

    # Expiring within 60 days
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
    batches = await db.batches.find({
        "tenant_id": ctx.tenant_id,
        "expiry_date": {"$lte": cutoff, "$ne": None},
        "qty": {"$gt": 0},
    }, {"_id": 0}).to_list(500)
    return {"low_stock": low, "expiring": batches}


# ------- Helper (also used by POS/GRN) -------
async def _apply_movement(tenant_id: str, product_id: str, location_id: str, qty: float, kind: str, ref_id: str, note: str = "", unit_cost: float = 0):
    """Update stock_levels + write stock_movement. qty is signed."""
    lvl = await db.stock_levels.find_one({"tenant_id": tenant_id, "product_id": product_id, "location_id": location_id})
    new_qty = (lvl.get("qty", 0) if lvl else 0) + qty
    new_avg = lvl.get("avg_cost", 0) if lvl else 0
    if qty > 0 and unit_cost > 0:
        # weighted average
        prev_qty = lvl.get("qty", 0) if lvl else 0
        prev_avg = lvl.get("avg_cost", 0) if lvl else 0
        total_qty = prev_qty + qty
        if total_qty > 0:
            new_avg = ((prev_qty * prev_avg) + (qty * unit_cost)) / total_qty

    if lvl:
        await db.stock_levels.update_one(
            {"tenant_id": tenant_id, "product_id": product_id, "location_id": location_id},
            {"$set": {"qty": new_qty, "avg_cost": new_avg}},
        )
    else:
        sl = StockLevel(tenant_id=tenant_id, product_id=product_id, location_id=location_id, qty=new_qty, avg_cost=new_avg or unit_cost)
        await db.stock_levels.insert_one(sl.model_dump())

    mv = StockMovement(
        tenant_id=tenant_id,
        product_id=product_id,
        location_id=location_id,
        qty=qty,
        kind=kind,
        ref_id=ref_id,
        note=note,
        unit_cost=unit_cost or new_avg,
    )
    await db.stock_movements.insert_one(mv.model_dump())
    return new_avg


@router.get("/movements")
async def list_movements(product_id: Optional[str] = None, ctx: AuthContext = Depends(get_current)):
    q = scope(ctx.tenant_id)
    if product_id:
        q["product_id"] = product_id
    return await db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
