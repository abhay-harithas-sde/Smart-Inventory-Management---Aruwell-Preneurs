"""Finance: expenses + P&L."""
from fastapi import APIRouter, Depends
from db import db, scope
from auth import get_current, AuthContext, require_roles
from models import Expense, ExpenseIn, now_iso

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/expenses")
async def list_expenses(ctx: AuthContext = Depends(get_current)):
    return await db.expenses.find(scope(ctx.tenant_id), {"_id": 0}).sort("date", -1).to_list(500)


@router.post("/expenses")
async def create_expense(inp: ExpenseIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "accountant"))):
    e = Expense(
        tenant_id=ctx.tenant_id,
        category=inp.category,
        amount=inp.amount,
        note=inp.note,
        date=inp.date or now_iso(),
    )
    await db.expenses.insert_one(e.model_dump())
    return e.model_dump()


@router.get("/pnl")
async def pnl(ctx: AuthContext = Depends(get_current)):
    sales = await db.sales.find({"tenant_id": ctx.tenant_id, "status": {"$ne": "refunded"}}, {"_id": 0}).to_list(5000)
    revenue = sum(s.get("subtotal", 0) for s in sales)
    tax_collected = sum(s.get("tax", 0) for s in sales)

    # COGS: sum of unit_cost * qty for sale movements
    cogs_pipeline = [
        {"$match": {"tenant_id": ctx.tenant_id, "kind": "sale"}},
        {"$group": {"_id": None, "cogs": {"$sum": {"$multiply": [{"$abs": "$qty"}, "$unit_cost"]}}}}
    ]
    cogs_doc = await db.stock_movements.aggregate(cogs_pipeline).to_list(1)
    cogs = cogs_doc[0]["cogs"] if cogs_doc else 0

    expenses = await db.expenses.find({"tenant_id": ctx.tenant_id}, {"_id": 0}).to_list(2000)
    expense_total = sum(e["amount"] for e in expenses)

    gross = revenue - cogs
    net = gross - expense_total

    return {
        "revenue": round(revenue, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(gross, 2),
        "expenses": round(expense_total, 2),
        "net_profit": round(net, 2),
        "tax_collected": round(tax_collected, 2),
    }
