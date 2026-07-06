"""Seed a demo retail tenant on first boot."""
import random
from datetime import datetime, timedelta, timezone
from db import db
from auth import hash_password
from models import Tenant, User, Location, Product, Supplier, StockLevel, StockMovement, Sale, PurchaseOrder, now_iso, gen_id


DEMO_EMAIL = "owner@demo.ath"
DEMO_PASSWORD = "demo1234"


async def seed_demo():
    existing = await db.users.find_one({"email": DEMO_EMAIL})
    if existing:
        return {"skipped": True, "tenant_id": existing["tenant_id"]}

    tenant = Tenant(name="Demo Retail Store", business_type="retail")
    await db.tenants.insert_one(tenant.model_dump())
    tid = tenant.id

    owner = User(
        tenant_id=tid, email=DEMO_EMAIL, name="Demo Owner", role="owner",
        password_hash=hash_password(DEMO_PASSWORD),
    )
    cashier = User(
        tenant_id=tid, email="cashier@demo.ath", name="Cashier Priya", role="cashier",
        password_hash=hash_password(DEMO_PASSWORD),
    )
    await db.users.insert_many([owner.model_dump(), cashier.model_dump()])

    loc = Location(tenant_id=tid, name="Main Store", address="MG Road, Bangalore")
    await db.locations.insert_one(loc.model_dump())

    supplier = Supplier(tenant_id=tid, name="Prime Distributors Pvt Ltd", phone="+91-98765-43210", email="orders@primedist.com", gstin="29ABCDE1234F1Z5")
    await db.suppliers.insert_one(supplier.model_dump())

    catalog = [
        ("SKU-001", "Basmati Rice 5kg", "Grocery", 650, 480, 25),
        ("SKU-002", "Sunflower Oil 1L", "Grocery", 175, 140, 40),
        ("SKU-003", "Aashirvaad Atta 5kg", "Grocery", 285, 220, 35),
        ("SKU-004", "Amul Butter 500g", "Dairy", 295, 240, 30),
        ("SKU-005", "Nandini Milk 1L", "Dairy", 58, 48, 60),
        ("SKU-006", "Coca Cola 2L", "Beverages", 95, 68, 45),
        ("SKU-007", "Lays Chips 90g", "Snacks", 30, 21, 80),
        ("SKU-008", "Parle-G Biscuit 800g", "Snacks", 90, 70, 55),
        ("SKU-009", "Colgate MaxFresh 200g", "Personal Care", 145, 108, 40),
        ("SKU-010", "Dettol Handwash 750ml", "Personal Care", 199, 148, 35),
        ("SKU-011", "Surf Excel 1kg", "Household", 220, 172, 30),
        ("SKU-012", "Vim Bar 200g", "Household", 25, 18, 60),
        ("SKU-013", "Tata Salt 1kg", "Grocery", 28, 22, 70),
        ("SKU-014", "Maggi Noodles 12pk", "Snacks", 180, 138, 40),
        ("SKU-015", "Kissan Jam 500g", "Grocery", 175, 132, 25),
        ("SKU-016", "Bru Coffee 200g", "Beverages", 320, 245, 20),
        ("SKU-017", "Red Label Tea 500g", "Beverages", 285, 220, 25),
        ("SKU-018", "Dove Soap 100g x4", "Personal Care", 195, 148, 30),
        ("SKU-019", "Harpic 1L", "Household", 165, 122, 25),
        ("SKU-020", "Fortune Toor Dal 1kg", "Grocery", 155, 118, 35),
    ]

    products = []
    for sku, name, cat, price, cost, initial_qty in catalog:
        p = Product(
            tenant_id=tid, sku=sku, barcode=sku.replace("-", ""), name=name, category=cat,
            price=float(price), cost=float(cost), reorder_level=10, tax_rate=18.0,
        )
        products.append((p, initial_qty))
        await db.products.insert_one(p.model_dump())
        # opening stock
        sl = StockLevel(tenant_id=tid, product_id=p.id, location_id=loc.id, qty=initial_qty, avg_cost=cost)
        await db.stock_levels.insert_one(sl.model_dump())
        mv = StockMovement(tenant_id=tid, product_id=p.id, location_id=loc.id, qty=initial_qty, kind="adjustment", note="Opening stock", unit_cost=cost)
        await db.stock_movements.insert_one(mv.model_dump())

    # A received PO
    po = PurchaseOrder(
        tenant_id=tid, po_no="PO-00001", supplier_id=supplier.id, supplier_name=supplier.name,
        location_id=loc.id,
        lines=[{"product_id": products[0][0].id, "name": products[0][0].name, "sku": products[0][0].sku,
                "qty": 20, "cost": products[0][0].cost, "received_qty": 20}],
        subtotal=20 * products[0][0].cost, total=20 * products[0][0].cost, status="received",
    )
    await db.purchase_orders.insert_one(po.model_dump())

    # Generate 45 days of sales history
    random.seed(42)
    invoice_seq = 0
    now = datetime.now(timezone.utc)
    for day_offset in range(45, 0, -1):
        day = now - timedelta(days=day_offset)
        # 3-10 orders per day
        for _ in range(random.randint(3, 10)):
            invoice_seq += 1
            n_items = random.randint(1, 4)
            picks = random.sample(products, n_items)
            lines = []
            subtotal = 0.0
            tax = 0.0
            for (p, _) in picks:
                qty = random.randint(1, 3)
                line_sub = qty * p.price
                line_tax = line_sub * p.tax_rate / 100
                subtotal += line_sub
                tax += line_tax
                lines.append({
                    "product_id": p.id, "name": p.name, "sku": p.sku, "qty": qty,
                    "price": p.price, "tax_rate": p.tax_rate, "line_total": line_sub + line_tax,
                })
                # deduct stock
                await db.stock_levels.update_one(
                    {"tenant_id": tid, "product_id": p.id, "location_id": loc.id},
                    {"$inc": {"qty": -qty}},
                )
                mv = StockMovement(tenant_id=tid, product_id=p.id, location_id=loc.id, qty=-qty, kind="sale", unit_cost=p.cost, note=f"Sale INV-{invoice_seq:06d}")
                mv.created_at = day.isoformat()
                await db.stock_movements.insert_one(mv.model_dump())

            sale = Sale(
                tenant_id=tid, invoice_no=f"INV-{invoice_seq:06d}", location_id=loc.id,
                customer_name=random.choice(["", "Walk-in", "Rahul S.", "Anjali K.", "Guest"]),
                lines=lines, subtotal=round(subtotal, 2), tax=round(tax, 2),
                total=round(subtotal + tax, 2), payment_mode=random.choice(["cash", "upi", "card"]),
                status="paid", cashier_id=cashier.id,
            )
            sale.created_at = day.isoformat()
            await db.sales.insert_one(sale.model_dump())

    return {"seeded": True, "tenant_id": tid, "email": DEMO_EMAIL, "password": DEMO_PASSWORD}
