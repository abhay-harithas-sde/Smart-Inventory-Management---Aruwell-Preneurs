"""Shared MongoDB client + helpers."""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def strip_mongo_id(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


def scope(tenant_id: str, extra: dict | None = None) -> dict:
    q = {"tenant_id": tenant_id}
    if extra:
        q.update(extra)
    return q
