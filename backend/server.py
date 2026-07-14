"""ATH ERP - FastAPI entrypoint."""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from db import db, client  # noqa: E402
from routes_auth import router as auth_router  # noqa: E402
from routes_inventory import router as inventory_router  # noqa: E402
from routes_pos import router as pos_router  # noqa: E402
from routes_procurement import router as procurement_router  # noqa: E402
from routes_finance import router as finance_router  # noqa: E402
from routes_dashboard import router as dashboard_router  # noqa: E402
from routes_ai import router as ai_router  # noqa: E402
from routes_payments import router as payments_router  # noqa: E402
from routes_notifications import router as notifications_router  # noqa: E402
from routes_tts import router as tts_router  # noqa: E402
from routes_uploads import router as uploads_router  # noqa: E402
from seed import seed_demo  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="ATH ERP API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"service": "ATH ERP", "status": "ok"}


@api_router.post("/seed/demo")
async def run_seed():
    return await seed_demo()


api_router.include_router(auth_router)
api_router.include_router(inventory_router)
api_router.include_router(pos_router)
api_router.include_router(procurement_router)
api_router.include_router(finance_router)
api_router.include_router(dashboard_router)
api_router.include_router(ai_router)
api_router.include_router(payments_router)
api_router.include_router(notifications_router)
api_router.include_router(tts_router)
api_router.include_router(uploads_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    for coll in ["users", "locations", "categories", "products", "batches",
                 "stock_levels", "stock_movements", "customers", "sales",
                 "suppliers", "purchase_orders", "expenses"]:
        await db[coll].create_index([("tenant_id", 1)])
    await db.users.create_index([("email", 1)], unique=True)
    await db.products.create_index([("tenant_id", 1), ("sku", 1)], unique=True)
    try:
        result = await seed_demo()
        logger.info(f"Seed status: {result}")
    except Exception as e:
        logger.error(f"Seed failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
