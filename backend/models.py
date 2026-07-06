"""Pydantic models for ATH ERP - all documents include tenant_id for isolation."""
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone
import uuid


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


Role = Literal["owner", "manager", "cashier", "warehouse", "accountant"]


class BaseDoc(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    created_at: str = Field(default_factory=now_iso)


# ---------- Auth / Tenant ----------
class Tenant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    name: str
    business_type: str = "retail"  # retail | pharmacy | distributor
    currency: str = "INR"
    default_tax_rate: float = 18.0
    created_at: str = Field(default_factory=now_iso)


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    email: str
    name: str
    role: Role = "owner"
    password_hash: str
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class SignupIn(BaseModel):
    business_name: str
    business_type: str = "retail"
    name: str
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class InviteIn(BaseModel):
    email: EmailStr
    name: str
    role: Role
    password: str


# ---------- Inventory ----------
class Location(BaseDoc):
    name: str
    address: str = ""


class Category(BaseDoc):
    name: str


class Product(BaseDoc):
    sku: str
    barcode: str = ""
    name: str
    category: str = ""
    unit: str = "pcs"
    tax_rate: float = 18.0
    price: float = 0.0
    cost: float = 0.0  # weighted avg cost
    reorder_level: int = 10
    lead_time_days: int = 7
    track_batch: bool = False
    image_url: str = ""


class ProductIn(BaseModel):
    sku: str
    barcode: str = ""
    name: str
    category: str = ""
    unit: str = "pcs"
    tax_rate: float = 18.0
    price: float = 0.0
    cost: float = 0.0
    reorder_level: int = 10
    lead_time_days: int = 7
    track_batch: bool = False
    image_url: str = ""


class Batch(BaseDoc):
    product_id: str
    location_id: str
    batch_no: str
    expiry_date: Optional[str] = None
    qty: float = 0
    cost: float = 0


class StockLevel(BaseDoc):
    product_id: str
    location_id: str
    qty: float = 0
    avg_cost: float = 0


class StockMovement(BaseDoc):
    product_id: str
    location_id: str
    qty: float  # +in / -out
    kind: str  # sale, purchase, adjustment, transfer, return
    ref_id: str = ""
    note: str = ""
    unit_cost: float = 0


# ---------- Sales / POS ----------
class Customer(BaseDoc):
    name: str
    phone: str = ""
    email: str = ""


class SaleLine(BaseModel):
    product_id: str
    name: str
    sku: str
    qty: float
    price: float
    tax_rate: float = 18.0
    line_total: float = 0


class Sale(BaseDoc):
    invoice_no: str
    location_id: str
    customer_id: str = ""
    customer_name: str = ""
    lines: List[SaleLine]
    subtotal: float
    tax: float
    total: float
    payment_mode: str = "cash"  # cash | card | upi | split
    payments: List[dict] = []
    status: str = "paid"  # paid | partial | refunded
    cashier_id: str = ""


class SaleIn(BaseModel):
    location_id: str
    customer_id: str = ""
    customer_name: str = ""
    lines: List[SaleLine]
    payment_mode: str = "cash"
    payments: List[dict] = []


# ---------- Procurement ----------
class Supplier(BaseDoc):
    name: str
    phone: str = ""
    email: str = ""
    address: str = ""
    gstin: str = ""


class POLine(BaseModel):
    product_id: str
    name: str
    sku: str
    qty: float
    cost: float
    received_qty: float = 0


class PurchaseOrder(BaseDoc):
    po_no: str
    supplier_id: str
    supplier_name: str = ""
    location_id: str
    lines: List[POLine]
    subtotal: float
    total: float
    status: str = "draft"  # draft | sent | partial | received | cancelled
    expected_date: Optional[str] = None


class POIn(BaseModel):
    supplier_id: str
    location_id: str
    lines: List[POLine]
    expected_date: Optional[str] = None


class GRNLine(BaseModel):
    product_id: str
    qty: float
    cost: float
    batch_no: str = ""
    expiry_date: Optional[str] = None


class GRNIn(BaseModel):
    po_id: str
    lines: List[GRNLine]


# ---------- Finance ----------
class Expense(BaseDoc):
    category: str
    amount: float
    note: str = ""
    date: str = Field(default_factory=now_iso)


class ExpenseIn(BaseModel):
    category: str
    amount: float
    note: str = ""
    date: Optional[str] = None


# ---------- NLQ ----------
class NLQIn(BaseModel):
    question: str
