"""POS / Sales / Customers / Invoices."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from db import db, scope
from auth import get_current, AuthContext, require_roles
from models import Sale, SaleIn, Customer, gen_id, now_iso
from routes_inventory import _apply_movement

router = APIRouter(prefix="/pos", tags=["pos"])


@router.get("/customers")
async def list_customers(q: Optional[str] = None, ctx: AuthContext = Depends(get_current)):
    query = scope(ctx.tenant_id)
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"phone": {"$regex": q, "$options": "i"}}]
    return await db.customers.find(query, {"_id": 0}).to_list(500)


@router.post("/customers")
async def create_customer(body: dict, ctx: AuthContext = Depends(get_current)):
    c = Customer(tenant_id=ctx.tenant_id, name=body["name"], phone=body.get("phone", ""), email=body.get("email", ""))
    await db.customers.insert_one(c.model_dump())
    return c.model_dump()


@router.post("/sales")
async def checkout(inp: SaleIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "cashier"))):
    if not inp.lines:
        raise HTTPException(400, "Empty cart")

    # Compute totals + validate stock
    subtotal = 0.0
    tax = 0.0
    computed_lines = []
    for l in inp.lines:
        product = await db.products.find_one({"tenant_id": ctx.tenant_id, "id": l.product_id})
        if not product:
            raise HTTPException(400, f"Product {l.product_id} not found")
        line_sub = l.qty * l.price
        line_tax = line_sub * (l.tax_rate or product.get("tax_rate", 0)) / 100
        subtotal += line_sub
        tax += line_tax
        computed_lines.append({**l.model_dump(), "line_total": line_sub + line_tax})

    total = subtotal + tax
    seq = await db.sales.count_documents({"tenant_id": ctx.tenant_id}) + 1
    invoice_no = f"INV-{seq:06d}"

    sale = Sale(
        tenant_id=ctx.tenant_id,
        invoice_no=invoice_no,
        location_id=inp.location_id,
        customer_id=inp.customer_id,
        customer_name=inp.customer_name,
        lines=computed_lines,
        subtotal=round(subtotal, 2),
        tax=round(tax, 2),
        total=round(total, 2),
        payment_mode=inp.payment_mode,
        payments=inp.payments,
        status="paid",
        cashier_id=ctx.user_id,
    )
    await db.sales.insert_one(sale.model_dump())

    # Deduct stock
    for l in computed_lines:
        await _apply_movement(ctx.tenant_id, l["product_id"], inp.location_id, -abs(float(l["qty"])), "sale", sale.id, f"Sale {invoice_no}")

    return sale.model_dump()


@router.get("/sales")
async def list_sales(limit: int = 100, ctx: AuthContext = Depends(get_current)):
    return await db.sales.find(scope(ctx.tenant_id), {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


@router.get("/sales/{sid}")
async def get_sale(sid: str, ctx: AuthContext = Depends(get_current)):
    s = await db.sales.find_one({"tenant_id": ctx.tenant_id, "id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Not found")
    return s


@router.post("/sales/{sid}/refund")
async def refund_sale(sid: str, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    s = await db.sales.find_one({"tenant_id": ctx.tenant_id, "id": sid})
    if not s:
        raise HTTPException(404, "Not found")
    if s.get("status") == "refunded":
        raise HTTPException(400, "Already refunded")
    for l in s["lines"]:
        await _apply_movement(ctx.tenant_id, l["product_id"], s["location_id"], abs(float(l["qty"])), "return", sid, f"Refund {s['invoice_no']}")
    await db.sales.update_one({"tenant_id": ctx.tenant_id, "id": sid}, {"$set": {"status": "refunded"}})
    return {"ok": True}
