"""Suppliers, Purchase Orders, GRN."""
from fastapi import APIRouter, Depends, HTTPException
from db import db, scope
from auth import get_current, AuthContext, require_roles
from models import Supplier, PurchaseOrder, POIn, GRNIn, Batch, gen_id, now_iso
from routes_inventory import _apply_movement

router = APIRouter(prefix="/procurement", tags=["procurement"])


@router.get("/suppliers")
async def list_suppliers(ctx: AuthContext = Depends(get_current)):
    return await db.suppliers.find(scope(ctx.tenant_id), {"_id": 0}).to_list(500)


@router.post("/suppliers")
async def create_supplier(body: dict, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    s = Supplier(tenant_id=ctx.tenant_id, **body)
    await db.suppliers.insert_one(s.model_dump())
    return s.model_dump()


@router.get("/pos")
async def list_pos(ctx: AuthContext = Depends(get_current)):
    return await db.purchase_orders.find(scope(ctx.tenant_id), {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/pos/{pid}")
async def get_po(pid: str, ctx: AuthContext = Depends(get_current)):
    po = await db.purchase_orders.find_one({"tenant_id": ctx.tenant_id, "id": pid}, {"_id": 0})
    if not po:
        raise HTTPException(404, "Not found")
    return po


@router.post("/pos")
async def create_po(inp: POIn, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    supplier = await db.suppliers.find_one({"tenant_id": ctx.tenant_id, "id": inp.supplier_id})
    if not supplier:
        raise HTTPException(400, "Supplier not found")
    subtotal = sum(l.qty * l.cost for l in inp.lines)
    seq = await db.purchase_orders.count_documents({"tenant_id": ctx.tenant_id}) + 1
    po = PurchaseOrder(
        tenant_id=ctx.tenant_id,
        po_no=f"PO-{seq:05d}",
        supplier_id=inp.supplier_id,
        supplier_name=supplier["name"],
        location_id=inp.location_id,
        lines=[l.model_dump() for l in inp.lines],
        subtotal=round(subtotal, 2),
        total=round(subtotal, 2),
        expected_date=inp.expected_date,
        status="sent",
    )
    await db.purchase_orders.insert_one(po.model_dump())
    return po.model_dump()


@router.post("/grn")
async def receive_grn(inp: GRNIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "warehouse"))):
    po = await db.purchase_orders.find_one({"tenant_id": ctx.tenant_id, "id": inp.po_id})
    if not po:
        raise HTTPException(404, "PO not found")

    lines = po["lines"]
    lookup = {l["product_id"]: l for l in lines}
    for gline in inp.lines:
        base = lookup.get(gline.product_id)
        if not base:
            continue
        base["received_qty"] = base.get("received_qty", 0) + gline.qty
        # apply stock in
        await _apply_movement(
            ctx.tenant_id, gline.product_id, po["location_id"], abs(float(gline.qty)),
            "purchase", po["id"], f"GRN for {po['po_no']}", unit_cost=gline.cost,
        )
        # update product avg cost
        await db.products.update_one({"tenant_id": ctx.tenant_id, "id": gline.product_id}, {"$set": {"cost": gline.cost}})
        # batch
        if gline.batch_no or gline.expiry_date:
            b = Batch(
                tenant_id=ctx.tenant_id,
                product_id=gline.product_id,
                location_id=po["location_id"],
                batch_no=gline.batch_no or "",
                expiry_date=gline.expiry_date,
                qty=gline.qty,
                cost=gline.cost,
            )
            await db.batches.insert_one(b.model_dump())

    # status
    all_received = all(l["received_qty"] >= l["qty"] for l in lines)
    status = "received" if all_received else "partial"
    await db.purchase_orders.update_one(
        {"tenant_id": ctx.tenant_id, "id": po["id"]},
        {"$set": {"lines": lines, "status": status}},
    )
    return {"ok": True, "status": status}
