# Smart Ledger — Detailed Server Architecture

> A multi-tenant ERP / POS platform built with FastAPI, React, and MongoDB.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Topology Diagram](#3-system-topology-diagram)
4. [Request Lifecycle](#4-request-lifecycle)
5. [Backend Structure](#5-backend-structure)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Data Model & MongoDB Collections](#7-data-model--mongodb-collections)
8. [Multi-Tenancy Strategy](#8-multi-tenancy-strategy)
9. [API Endpoints — Full Catalog](#9-api-endpoints--full-catalog)
10. [Business Logic Modules](#10-business-logic-modules)
11. [External Service Integrations](#11-external-service-integrations)
12. [Frontend Architecture](#12-frontend-architecture)
13. [State Management](#13-state-management)
14. [Security Design](#14-security-design)
15. [Startup & Seeding](#15-startup--seeding)
16. [Environment Configuration](#16-environment-configuration)
17. [Deployment Topology](#17-deployment-topology)

---

## 1. High-Level Overview

Smart Ledger is a **multi-tenant ERP system** targeting retail, pharmacy, and distributor businesses. It follows a classic three-tier architecture:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLIENT  (Browser / SPA)                         │
│         React 19 · React Router v7 · TanStack Query · shadcn/ui     │
└────────────────────────────┬────────────────────────────────────────┘
                             │  HTTPS · REST · JSON  (/api/*)
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                BACKEND  (FastAPI + Uvicorn)                          │
│  11 router modules · JWT RBAC middleware · Pydantic v2 validation   │
└────────────────────────────┬────────────────────────────────────────┘
                             │  Motor (async)
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                   MongoDB  (Atlas or local)                          │
│           15 collections · tenant_id isolation · UUID IDs           │
└─────────────────────────────────────────────────────────────────────┘
```

Every document in every collection carries a `tenant_id` field. All queries are scoped to the caller's tenant, enforced in the application layer — no separate databases or schemas per tenant.

---

## 2. Technology Stack

### Backend

| Layer | Technology | Version |
|---|---|---|
| Web framework | FastAPI | 0.110.1 |
| ASGI server | Uvicorn | 0.25.0 |
| Async DB driver | Motor (MongoDB) | 3.3.1 |
| Sync DB driver | PyMongo | 4.6.3 |
| Data validation | Pydantic v2 | ≥2.6.4 |
| Auth / tokens | PyJWT | ≥2.10.1 |
| Password hashing | bcrypt | 4.1.3 |
| HTTP client | httpx | ≥0.28.1 |
| AI / LLM | openai SDK | ≥1.30.0 |
| Payments | razorpay | 2.0.1 |
| Notifications | twilio | 9.10.9 |
| Text-to-speech | elevenlabs | 2.58.0 |
| Image hosting | cloudinary | 1.45.0 |
| Env management | python-dotenv | ≥1.0.1 |

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Routing | React Router v7 |
| Server state | TanStack Query v5 |
| HTTP client | Axios |
| UI components | shadcn/ui (Radix UI + Tailwind) |
| Charts | Recharts |
| Animations | Framer Motion |
| Notifications | Sonner (toast) |
| Icons | Lucide React |
| Build tool | CRACO (CRA extension) |

---

## 3. System Topology Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                    │
│                                                                         │
│  React SPA                                                              │
│  ├── AuthProvider (JWT in localStorage)                                 │
│  ├── Axios (adds Authorization: Bearer <token> to every request)        │
│  └── TanStack Query (caches, refetches, invalidates server data)        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  HTTPS JSON REST
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                         FASTAPI APPLICATION                             │
│                          server.py  (app factory)                       │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              CORS Middleware (CORSMiddleware)                    │   │
│  │   Origins controlled by CORS_ORIGINS env var                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │
│  │ /api/auth  │  │/api/inven- │  │  /api/pos  │  │/api/procurement│   │
│  │            │  │  tory      │  │            │  │                │   │
│  │ signup     │  │ locations  │  │ customers  │  │ suppliers      │   │
│  │ login      │  │ categories │  │ sales      │  │ purchase orders│   │
│  │ me         │  │ products   │  │ checkout   │  │ GRN (receiving) │   │
│  │ google/    │  │ stock adj  │  │ refunds    │  │                │   │
│  │  session   │  │ alerts     │  │            │  │                │   │
│  │ invite     │  │ movements  │  │            │  │                │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘   │
│                                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │
│  │/api/finance│  │/api/dash-  │  │   /api/ai  │  │/api/payments/  │   │
│  │            │  │  board     │  │            │  │  razorpay      │   │
│  │ expenses   │  │ summary    │  │ nlq        │  │                │   │
│  │ p&l        │  │  (KPIs,    │  │ forecast   │  │ config         │   │
│  │            │  │   trends,  │  │ insights   │  │ order          │   │
│  │            │  │   top SKUs)│  │            │  │ verify         │   │
│  │            │  │            │  │            │  │ webhook        │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘   │
│                                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────────────┐   │
│  │/api/notify │  │  /api/tts  │  │       /api/uploads             │   │
│  │            │  │            │  │                                │   │
│  │ sms        │  │ speak      │  │ sign (Cloudinary signature)    │   │
│  │ whatsapp   │  │ voices     │  │                                │   │
│  │ low-stock  │  │            │  │                                │   │
│  │  digest    │  │            │  │                                │   │
│  │ daily-pnl  │  │            │  │                                │   │
│  │ invoice wa │  │            │  │                                │   │
│  │ history    │  │            │  │                                │   │
│  └────────────┘  └────────────┘  └────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │           JWT Auth Middleware  (Dependency Injection)           │   │
│  │   get_current() → AuthContext { user_id, tenant_id, role }      │   │
│  │   require_roles("owner", "manager") → guards sensitive routes   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────────┘
          │                    │ Motor async                │
          │                    ▼                            │
┌─────────▼──────────────────────────────────────────────  ▼ ────────────┐
│                         MONGODB DATABASE                                │
│                                                                         │
│  tenants · users · locations · categories · products · batches          │
│  stock_levels · stock_movements · customers · sales                     │
│  suppliers · purchase_orders · expenses · notifications                 │
│  razorpay_orders                                                        │
│                                                                         │
│  Indexes: tenant_id (all collections) · users.email (unique)           │
│           (tenant_id, sku) on products (unique)                         │
└─────────────────────────────────────────────────────────────────────────┘
          │                    │                            │
          ▼                    ▼                            ▼
   ┌────────────┐    ┌──────────────────┐        ┌──────────────────┐
   │  OpenAI    │    │  Razorpay API    │        │  Twilio API      │
   │  (GPT-4o-  │    │  (orders +       │        │  (SMS +          │
   │   mini)    │    │   verify +       │        │   WhatsApp)      │
   │            │    │   webhooks)      │        │                  │
   └────────────┘    └──────────────────┘        └──────────────────┘
          │                    │                            │
   ┌────────────┐    ┌──────────────────┐
   │ ElevenLabs │    │  Cloudinary CDN  │
   │  (TTS MP3) │    │  (product images)│
   └────────────┘    └──────────────────┘
```

---

## 4. Request Lifecycle

Every HTTP request to the API goes through this pipeline:

```
Browser sends:  POST /api/pos/sales
                Authorization: Bearer eyJhbGci...
                Content-Type: application/json
                { "location_id": "...", "lines": [...], ... }

Step 1 — CORS Middleware
  ↳ Check Origin header against CORS_ORIGINS env var
  ↳ Attach CORS response headers
  ↳ Handle preflight OPTIONS requests

Step 2 — Route Matching
  ↳ FastAPI matches POST /api/pos/sales → checkout() in routes_pos.py

Step 3 — JWT Dependency (get_current)
  ↳ Extract Bearer token from Authorization header
  ↳ jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
  ↳ Build AuthContext { user_id, tenant_id, role }
  ↳ If token missing/invalid → HTTP 401

Step 4 — Role Guard (require_roles)
  ↳ For /pos/sales: require_roles("owner", "manager", "cashier")
  ↳ ctx.role not in allowed → HTTP 403

Step 5 — Pydantic Validation
  ↳ Request body deserialized into SaleIn model
  ↳ Type errors → HTTP 422 Unprocessable Entity

Step 6 — Business Logic
  ↳ Validate each line item product exists in tenant scope
  ↳ Compute subtotal, tax (per-product tax_rate), total
  ↳ Generate sequential invoice number (INV-000001)
  ↳ Insert Sale document into MongoDB (tenant-scoped)
  ↳ Call _apply_movement() for each line → deduct stock

Step 7 — MongoDB Operations (Motor async)
  ↳ All queries include { "tenant_id": ctx.tenant_id }
  ↳ Awaited coroutines — never blocks event loop

Step 8 — JSON Response
  ↳ Pydantic model serialized to JSON
  ↳ HTTP 200 with sale document
  ↳ Browser receives response
```

---

## 5. Backend Structure

```
backend/
├── server.py              ← App factory, lifespan, CORS, router mounting
├── db.py                  ← Motor client singleton + scope() helper
├── auth.py                ← JWT issue/verify, AuthContext, RBAC guards
├── models.py              ← All Pydantic v2 domain models
├── seed.py                ← Demo tenant + sample data, runs on startup
│
├── routes_auth.py         ← /api/auth/*
├── routes_inventory.py    ← /api/inventory/*
├── routes_pos.py          ← /api/pos/*
├── routes_procurement.py  ← /api/procurement/*
├── routes_finance.py      ← /api/finance/*
├── routes_dashboard.py    ← /api/dashboard/*
├── routes_ai.py           ← /api/ai/*
├── routes_payments.py     ← /api/payments/razorpay/*
├── routes_notifications.py← /api/notify/*
├── routes_tts.py          ← /api/tts/*
├── routes_uploads.py      ← /api/uploads/*
│
├── .env                   ← Secrets (never committed)
├── requirements.txt       ← Python dependencies
└── pytest.ini             ← Test configuration
```

### server.py — App Factory

`server.py` is the entry point. It:

1. Loads `.env` via `python-dotenv` before any imports that need env vars
2. Defines a `lifespan` async context manager that:
   - Creates MongoDB indexes on startup (tenant_id for all collections, unique indexes for email and sku)
   - Runs `seed_demo()` to populate a demo tenant if not already present
   - Closes the Motor client on shutdown
3. Creates the `FastAPI` app instance with `lifespan=lifespan`
4. Mounts all 11 route routers under a shared `/api` prefix router
5. Attaches `CORSMiddleware` last (Starlette processes middleware in reverse registration order, so CORS runs first)

### db.py — Database Layer

```python
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

def scope(tenant_id: str, extra: dict = None) -> dict:
    # Returns { "tenant_id": tenant_id, ...extra }
    # Used as the base query filter in every route
```

`scope()` is a small but critical helper — every query in every route file starts with `scope(ctx.tenant_id)` to ensure tenant isolation.

### auth.py — JWT & RBAC

```python
# Token creation
def make_token(user_id, tenant_id, role) -> str:
    # payload: { sub: user_id, tid: tenant_id, role: role, exp: now+168h }
    # signed HS256 with JWT_SECRET

# FastAPI dependency — injects AuthContext into any route
async def get_current(creds: HTTPAuthorizationCredentials) -> AuthContext:
    # Decodes and validates the Bearer token
    # Returns AuthContext(user_id, tenant_id, role)

# Role-gated dependency factory
def require_roles(*roles: str):
    # Returns a FastAPI dependency that calls get_current() first,
    # then checks ctx.role is in the allowed set
```

---

## 6. Authentication & Authorization

### Email / Password Flow

```
POST /api/auth/signup
  → Validate email not already taken
  → Create Tenant document (id=uuid, name=business_name)
  → Create default "Main Store" Location for the tenant
  → Hash password with bcrypt (cost factor default)
  → Create User document (role="owner")
  → Sign JWT: { sub: user_id, tid: tenant_id, role: "owner", exp: +168h }
  → Return { token, user, tenant }

POST /api/auth/login
  → Look up User by email (lowercased)
  → bcrypt.checkpw(input_password, stored_hash)
  → Check user.active == true
  → Sign JWT
  → Return { token, user, tenant }
```

### Google OAuth Flow (via Emergent Agent)

```
1. Browser opens Google OAuth popup (handled by Emergent Agent platform)
2. On success, URL fragment contains: #session_id=<opaque_hash>
3. AuthCallback.jsx detects the fragment, extracts session_id
4. Frontend calls: POST /api/auth/google/session
   Header: X-Session-ID: <session_id>
5. Backend calls Emergent session endpoint:
   GET https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data
   Header: X-Session-ID: <session_id>
   Response: { email, name }
6. If email exists in DB → log in to existing account
   If email is new → auto-create Tenant + User (role="owner")
7. Sign and return JWT
```

### Team Invite Flow

```
POST /api/auth/invite  (owner/manager only)
  Body: { email, name, role, password }
  → Validate email not taken
  → Create User with ctx.tenant_id (same tenant as inviter)
  → Role can be: owner | manager | cashier | warehouse | accountant
```

### JWT Storage & Transport

- Stored in `localStorage` under key `ath_token`
- Attached by Axios request interceptor: `Authorization: Bearer <token>`
- On HTTP 401 from any endpoint: interceptor clears token and redirects to `/login`
- Token expiry: 168 hours (7 days), configurable via `JWT_EXPIRE_HOURS` env var

### Role-Based Access Control

| Role | Permissions |
|---|---|
| `owner` | Full access to all endpoints |
| `manager` | Most operations; cannot change owner settings |
| `cashier` | POS checkout, SMS receipt sending |
| `warehouse` | Inventory adjustments, GRN receiving, product management |
| `accountant` | Finance read/write; no inventory or POS |

Route-level guards are applied via `Depends(require_roles(...))`. Examples:
- `POST /pos/sales` → `require_roles("owner", "manager", "cashier")`
- `DELETE /inventory/products/{pid}` → `require_roles("owner", "manager")`
- `POST /notify/daily-pnl` → `require_roles("owner")`
- `GET /dashboard/summary` → `get_current()` (any authenticated role)

---

## 7. Data Model & MongoDB Collections

All domain documents extend `BaseDoc`:

```python
class BaseDoc(BaseModel):
    id: str = Field(default_factory=gen_id)   # UUID4 string
    tenant_id: str                              # Multi-tenancy key
    created_at: str = Field(default_factory=now_iso)  # ISO-8601 UTC
```

### Collection Reference

#### `tenants`
```
id, name, business_type (retail|pharmacy|distributor),
currency (default "INR"), default_tax_rate (default 18.0), created_at
```

#### `users`
```
id, tenant_id, email (unique globally), name,
role (owner|manager|cashier|warehouse|accountant),
password_hash, active (bool), created_at
```

#### `locations`
```
id, tenant_id, name, address, created_at
```
Represents store branches or warehouse locations. Every sale and stock movement is linked to a location.

#### `categories`
```
id, tenant_id, name, created_at
```

#### `products`
```
id, tenant_id, sku (unique per tenant), barcode, name, category,
unit, tax_rate, price (selling), cost (weighted avg),
reorder_level, lead_time_days, track_batch (bool), image_url, created_at
```

#### `stock_levels`
```
id, tenant_id, product_id, location_id,
qty (current stock), avg_cost (weighted average cost), created_at
```
One document per (product × location) combination. Updated atomically on every stock movement.

#### `stock_movements`
```
id, tenant_id, product_id, location_id,
qty (+in / -out), kind (sale|purchase|adjustment|transfer|return),
ref_id (sale_id or po_id), note, unit_cost, created_at
```
Immutable audit log of every stock change.

#### `batches`
```
id, tenant_id, product_id, location_id,
batch_no, expiry_date (ISO string), qty, cost, created_at
```
Only populated for products with `track_batch=true`.

#### `customers`
```
id, tenant_id, name, phone, email, created_at
```

#### `sales`
```
id, tenant_id, invoice_no (INV-000001 sequential),
location_id, customer_id, customer_name,
lines: [{ product_id, name, sku, qty, price, tax_rate, line_total }],
subtotal, tax, total,
payment_mode (cash|card|upi|split|razorpay),
payments: [{ mode, amount }],
status (paid|partial|refunded),
cashier_id, created_at
```

#### `suppliers`
```
id, tenant_id, name, phone, email, address, gstin, created_at
```

#### `purchase_orders`
```
id, tenant_id, po_no (PO-00001 sequential),
supplier_id, supplier_name, location_id,
lines: [{ product_id, name, sku, qty, cost, received_qty }],
subtotal, total, status (draft|sent|partial|received|cancelled),
expected_date, created_at
```

#### `expenses`
```
id, tenant_id, category, amount, note, date, created_at
```

#### `notifications`
```
tenant_id, channel (sms|whatsapp), kind (invoice|low_stock_digest|daily_pnl),
to, body, provider_sid (Twilio message SID), sent_at
```

#### `razorpay_orders`
```
id (Razorpay order_id), tenant_id, user_id,
amount (rupees), amount_paise, receipt,
status (created|paid|failed),
razorpay_payment_id, created_at, paid_at
```

### Entity Relationship Overview

```
Tenant (1)
 ├── User (N)
 ├── Location (N)
 ├── Category (N)
 ├── Product (N)
 │    ├── StockLevel (1 per location)
 │    ├── StockMovement (N — immutable log)
 │    └── Batch (N — when track_batch=true)
 ├── Customer (N)
 ├── Sale (N)
 │    └── SaleLine (embedded array)
 ├── Supplier (N)
 ├── PurchaseOrder (N)
 │    └── POLine (embedded array, tracks received_qty)
 ├── Expense (N)
 ├── Notification (N)
 └── RazorpayOrder (N)
```

All cross-collection references use UUID string `id` fields (never MongoDB ObjectIds).

---

## 8. Multi-Tenancy Strategy

Smart Ledger uses **shared database, shared collections** (pool model) multi-tenancy.

Every document in every collection has `tenant_id: str`. Isolation is enforced entirely in application code:

1. The `AuthContext` extracted from the JWT carries `tenant_id`
2. Every route uses `scope(ctx.tenant_id)` as the base MongoDB filter
3. The `db.py` `scope()` helper always prepends `{ "tenant_id": tenant_id }` to any query dict
4. The AI NLQ module forcibly injects `{ "$match": { "tenant_id": ctx.tenant_id } }` as the **first pipeline stage** before executing any LLM-generated MongoDB aggregation, preventing cross-tenant data leakage even if the LLM produces a query without a tenant filter
5. MongoDB indexes on `tenant_id` across all collections ensure filtered queries remain performant

**New tenant creation:** Happens on `POST /api/auth/signup` or Google OAuth for a new email. Each new tenant gets a UUID, a "Main Store" location, and an owner user.

**Demo tenant:** `seed.py` creates a fixed demo tenant on first startup, populated with sample products, sales, suppliers, and POs. This runs automatically in the `lifespan` context.

---

## 9. API Endpoints — Full Catalog

All routes are prefixed with `/api`.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | None | Create tenant + owner account |
| POST | `/auth/login` | None | Login with email/password |
| GET | `/auth/me` | Any | Get current user + tenant |
| GET | `/auth/users` | owner, manager | List all users in tenant |
| POST | `/auth/google/session` | None | Exchange Google session_id for JWT |
| POST | `/auth/invite` | owner, manager | Invite new team member |

### Inventory — `/api/inventory`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/inventory/locations` | Any | List store locations |
| POST | `/inventory/locations` | owner, manager | Create location |
| GET | `/inventory/categories` | Any | List categories |
| POST | `/inventory/categories` | owner, manager | Create category |
| GET | `/inventory/products` | Any | List products with stock totals |
| GET | `/inventory/products/{pid}` | Any | Get single product |
| POST | `/inventory/products` | owner, manager, warehouse | Create product |
| PUT | `/inventory/products/{pid}` | owner, manager, warehouse | Update product |
| DELETE | `/inventory/products/{pid}` | owner, manager | Delete product |
| POST | `/inventory/adjust` | owner, manager, warehouse | Manual stock adjustment |
| GET | `/inventory/alerts` | Any | Low-stock + expiring batch alerts |
| GET | `/inventory/movements` | Any | Stock movement audit log |

### POS / Sales — `/api/pos`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/pos/customers` | Any | Search/list customers |
| POST | `/pos/customers` | Any | Create customer |
| POST | `/pos/sales` | owner, manager, cashier | Checkout (creates sale + deducts stock) |
| GET | `/pos/sales` | Any | List sales (most recent first) |
| GET | `/pos/sales/{sid}` | Any | Get single sale |
| POST | `/pos/sales/{sid}/refund` | owner, manager | Refund sale (restores stock) |

### Procurement — `/api/procurement`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/procurement/suppliers` | Any | List suppliers |
| POST | `/procurement/suppliers` | owner, manager | Create supplier |
| GET | `/procurement/pos` | Any | List purchase orders |
| GET | `/procurement/pos/{pid}` | Any | Get purchase order |
| POST | `/procurement/pos` | owner, manager | Create purchase order |
| POST | `/procurement/grn` | owner, manager, warehouse | Receive goods (GRN) |

### Finance — `/api/finance`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/finance/expenses` | Any | List all expenses |
| POST | `/finance/expenses` | owner, manager, accountant | Log expense |
| GET | `/finance/pnl` | Any | P&L report (revenue, COGS, gross, net) |

### Dashboard — `/api/dashboard`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard/summary` | Any | KPIs: today's revenue, orders, stock value, top products, 30-day trend, category mix |

### AI — `/api/ai`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/ai/nlq` | Any | Natural language → MongoDB aggregation → results |
| GET | `/ai/forecast` | Any | 30-day demand forecast per SKU (moving avg) |
| GET | `/ai/insights` | Any | LLM-generated business narrative (bullet points) |

### Payments — `/api/payments/razorpay`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/payments/razorpay/config` | Any | Get public Razorpay key_id |
| POST | `/payments/razorpay/order` | owner, manager, cashier | Create Razorpay payment order |
| POST | `/payments/razorpay/verify` | Any | Verify HMAC-SHA256 payment signature |
| POST | `/payments/razorpay/webhook` | None (HMAC-verified) | Async payment status webhook |

### Notifications — `/api/notify`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/notify/sms` | owner, manager, cashier | Send custom SMS via Twilio |
| POST | `/notify/whatsapp` | owner, manager | Send custom WhatsApp message |
| POST | `/notify/low-stock-digest` | owner, manager | Compose + send low-stock WhatsApp alert |
| POST | `/notify/daily-pnl` | owner | Compose + send daily P&L WhatsApp summary |
| POST | `/notify/whatsapp/invoice` | owner, manager, cashier | Send formatted invoice via WhatsApp |
| GET | `/notify/history` | Any | Last 100 sent notifications |

### TTS — `/api/tts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/tts/speak` | Any | Convert text to MP3 audio (ElevenLabs) |
| GET | `/tts/voices` | Any | List available ElevenLabs voices |

### Uploads — `/api/uploads`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/uploads/sign` | owner, manager, warehouse | Generate Cloudinary upload signature |

---

## 10. Business Logic Modules

### Stock Movement Engine (`_apply_movement`)

The most critical shared function in the codebase. Called by POS checkout, GRN receiving, refunds, and manual adjustments.

```
_apply_movement(tenant_id, product_id, location_id, qty, kind, ref_id, note, unit_cost)

1. Fetch current StockLevel for (tenant_id, product_id, location_id)
2. Compute new_qty = current_qty + qty  (qty is signed: +in / -out)
3. If new_qty < 0 → raise HTTP 400 "Insufficient stock"
4. If qty > 0 and unit_cost > 0:
     Recalculate weighted average cost:
     new_avg = ((prev_qty × prev_avg) + (qty × unit_cost)) / (prev_qty + qty)
5. Upsert StockLevel document with new qty + avg_cost
6. Insert immutable StockMovement record (audit trail)
7. Return new_avg
```

This function is imported and used across `routes_pos.py`, `routes_procurement.py`, and `routes_inventory.py`, ensuring all stock mutations follow the same atomic pattern.

### POS Checkout Flow

```
POST /api/pos/sales

1. Validate cart is not empty
2. For each line item:
   a. Fetch product from DB (validates product exists in tenant scope)
   b. Compute line_sub = qty × price
   c. Compute line_tax = line_sub × tax_rate / 100
   d. Accumulate subtotal + tax
3. total = subtotal + tax
4. Generate invoice_no: "INV-" + zero-padded sequential count
5. Insert Sale document
6. For each line: _apply_movement(qty= -abs(qty), kind="sale")
7. Return sale document
```

### GRN (Goods Receipt Note) Flow

```
POST /api/procurement/grn

1. Fetch PurchaseOrder by po_id + tenant_id
2. For each GRN line:
   a. Find matching PO line by product_id
   b. Increment line.received_qty
   c. Read current StockLevel BEFORE movement (for weighted avg calculation)
   d. _apply_movement(qty=+abs(qty), kind="purchase", unit_cost=cost)
   e. Recalculate product.cost (weighted average) and update product document
   f. If batch_no or expiry_date present → create Batch document
3. Check if all PO lines fully received:
   all_received → status = "received"
   else → status = "partial"
4. Update PurchaseOrder with new line received_qty + status
```

### Dashboard KPI Computation

```
GET /api/dashboard/summary

Queries run in parallel (but written sequentially):
- Today's sales (created_at >= today midnight UTC)
- Last 30 days of sales (for trend + top products + category mix)
- All stock levels (for total stock value + low-stock count)
- All products (for reorder level comparison)
- Batch documents expiring in next 60 days
- Purchase orders in draft/sent/partial status

Returns:
- today_revenue, today_orders
- stock_value (sum of qty × avg_cost across all stock levels)
- low_stock_count (products at or below reorder_level)
- expiring_soon (batch count)
- pending_pos (count)
- sales_trend (30 days, filled with 0 for days with no sales)
- top_products (top 5 by revenue, last 30 days)
- category_mix (revenue per category, last 30 days)
```

### P&L Calculation

```
GET /api/finance/pnl

revenue        = sum of all non-refunded sales totals
tax_collected  = sum of all non-refunded sales tax
cogs           = MongoDB aggregation: sum(abs(qty) × unit_cost) for all "sale" stock movements
expenses       = sum of all expense amounts
gross_profit   = revenue - cogs
net_profit     = gross_profit - expenses
```

COGS is computed from the `stock_movements` collection using the unit cost recorded at the time of sale (which equals the weighted average cost at that moment).

---

## 11. External Service Integrations

### OpenAI — AI Module (`routes_ai.py`)

Three features powered by GPT-4o-mini:

**1. Natural Language Query (NLQ)**
```
User question → system prompt with full MongoDB schema → LLM generates:
{
  "collection": "sales",
  "pipeline": [ ...aggregation stages... ],
  "chart": "bar",
  "explanation": "..."
}

Security pipeline:
  - _extract_json(): strips markdown fences, finds first { to last }
  - _sanitize_pipeline(): removes $out/$merge stages, prepends tenant_id $match
  - allowlist check: only 8 named collections allowed
  - hard $limit: 200 documents cap
  - db[collection].aggregate(pipeline) executed

Frontend renders result as table / bar / line / pie chart using Recharts.
```

**2. Demand Forecast**
```
Last 60 days of sales aggregated per product per day.
avg_daily = total_sold_60d / 60
forecast_30d = avg_daily × 30
reorder_qty = max(0, forecast_30d - current_stock + (avg_daily × lead_time_days))
Top 50 by forecast volume returned.
No LLM involved — pure arithmetic.
```

**3. Business Insights Narrative**
```
Last 200 sales summarized: order count, revenue, top 5 products by revenue.
That context string sent to GPT-4o-mini with system prompt:
  "You are an ERP business analyst. Reply in 3-4 short bullet points
   with actionable insights. No preamble."
Returns: narrative text → read back as-is on the AI Insights page.
```

### Razorpay — Payment Collection (`routes_payments.py`)

```
Flow:
1. POST /payments/razorpay/order
   - Convert rupees → paise (× 100)
   - razorpay.Client.order.create({ amount, currency: "INR", receipt, notes })
   - Persist to razorpay_orders collection for audit
   - Return { order_id, amount_paise, currency, key_id }

2. Frontend opens Razorpay Checkout modal (Checkout.js from CDN)
   - Customer pays via UPI QR / card / net banking
   - On success: handler receives { razorpay_order_id, razorpay_payment_id, razorpay_signature }

3. POST /payments/razorpay/verify
   - HMAC-SHA256 verification:
     expected = hmac(key_secret, f"{order_id}|{payment_id}")
     compare_digest(expected, signature)
   - On match: update razorpay_orders status="paid"
   - Return { verified: true }

4. POST /payments/razorpay/webhook (optional async path)
   - HMAC-SHA256 verification of X-Razorpay-Signature header
   - payment.captured event → mark order paid + update linked sale
   - payment.failed event → mark order failed
```

### Twilio — Notifications (`routes_notifications.py`)

Five notification types, all logged to the `notifications` collection:

- **SMS** (`POST /notify/sms`): arbitrary SMS to any E.164 number
- **WhatsApp** (`POST /notify/whatsapp`): arbitrary WhatsApp message
- **Low-stock digest**: queries all products vs reorder levels, composes a WhatsApp message listing items at or below threshold
- **Daily P&L**: queries today's sales, computes revenue + tax, formats WhatsApp summary
- **Invoice WhatsApp**: fetches a sale by ID, formats all line items + totals into a WhatsApp invoice message

The Twilio client is cached as a singleton via `@functools.lru_cache(maxsize=1)`.

### ElevenLabs — Text-to-Speech (`routes_tts.py`)

```
POST /tts/speak  { text: "...", voice_id: optional }

- Uses eleven_multilingual_v2 model (configurable via ELEVENLABS_MODEL env)
- Default voice: Rachel (21m00Tcm4TlvDq8ikWAM), overridable via ELEVENLABS_VOICE_ID
- SDK returns a bytes generator (blocking I/O)
- Collected via asyncio.to_thread() to avoid blocking the async event loop
- Returned as StreamingResponse with media_type="audio/mpeg"
- Text limit: 5000 characters
```

### Cloudinary — Product Images (`routes_uploads.py`)

Uses a **signed browser-direct upload** pattern. The Python server never handles the file bytes:

```
POST /uploads/sign  { folder: "products", public_id: optional }

1. Server generates a time-stamped Cloudinary signature using api_sign_request()
2. Returns: { signature, timestamp, cloud_name, api_key, folder, upload_url }
3. Frontend POSTs the file directly to Cloudinary's upload API using the signature
4. Cloudinary returns the public image URL
5. Frontend stores image_url on the product document via PUT /inventory/products/{pid}

Security: signature expires (timestamp-based), api_secret never sent to browser,
          uploads scoped to ath-erp/{tenant_id}/products/ folder.
```

---

## 12. Frontend Architecture

```
frontend/src/
├── App.js                    ← Root: BrowserRouter + AuthProvider + Routes
├── App.css                   ← Global styles (Tailwind base)
│
├── lib/
│   ├── api.js                ← Axios instance (base URL, Bearer interceptor, 401 handler)
│   ├── auth.jsx              ← AuthContext (user, tenant, login, signup, logout, refresh)
│   └── razorpay.js           ← payWithRazorpay() helper (creates order, opens modal, verifies)
│
├── components/
│   ├── Layout.jsx            ← App shell: sidebar nav + top bar + <Outlet />
│   ├── NLQDialog.jsx         ← AI natural language query modal (Ctrl+K)
│   └── ui/                   ← shadcn/ui components (button, card, dialog, table, etc.)
│
└── pages/
    ├── Login.jsx             ← Email/password + Google OAuth login
    ├── Signup.jsx            ← Business registration
    ├── AuthCallback.jsx      ← Handles #session_id= fragment from Google OAuth
    ├── Dashboard.jsx         ← KPI cards + sales trend chart + top products
    ├── Inventory.jsx         ← Product CRUD + stock levels + batch management + alerts
    ├── POS.jsx               ← Point-of-sale terminal (barcode scan, cart, checkout)
    ├── Sales.jsx             ← Sales history + refunds + invoice view
    ├── Procurement.jsx       ← Suppliers + purchase orders + GRN receiving
    ├── Finance.jsx           ← Expenses + P&L report
    ├── AIInsights.jsx        ← NLQ + forecast + insights + TTS read-aloud
    ├── Notifications.jsx     ← Send SMS/WhatsApp + notification history
    └── Settings.jsx          ← User profile + team management + tenant config
```

### Routing

```javascript
// Public routes (redirect to / if already logged in)
/login    → Login.jsx
/signup   → Signup.jsx

// Protected routes (redirect to /login if not authenticated)
/                     → Dashboard.jsx
/inventory            → Inventory.jsx
/pos                  → POS.jsx
/sales                → Sales.jsx
/procurement          → Procurement.jsx
/finance              → Finance.jsx
/ai                   → AIInsights.jsx
/notifications        → Notifications.jsx
/settings             → Settings.jsx

// Special: OAuth callback detected synchronously by URL fragment
// before Protected/Public guards can run
#session_id=...       → AuthCallback.jsx
```

The `Protected` wrapper checks `useAuth().user` — if null and not loading, redirects to `/login`. The `PublicOnly` wrapper redirects authenticated users to `/`.

### API Client (`lib/api.js`)

```javascript
const api = axios.create({ baseURL: `${REACT_APP_BACKEND_URL}/api` });

// Request interceptor: attach JWT
api.interceptors.request.use(config => {
  const token = localStorage.getItem("ath_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(null, err => {
  if (err?.response?.status === 401) {
    localStorage.removeItem("ath_token");
    window.location.href = "/login";  // hard redirect
  }
  return Promise.reject(err);
});
```

### Layout Shell (`components/Layout.jsx`)

The `Layout` component renders:
- **Sidebar** (60px wide): Smart Ledger logo, navigation links, workspace name
- **Top bar**: NLQ search bar (Ctrl+K shortcut), user menu dropdown (Settings, Sign out)
- **Main content area**: `<Outlet />` renders the current page
- **NLQDialog**: globally mounted, opens on Ctrl+K or clicking the search bar

---

## 13. State Management

Smart Ledger uses a **server-state** architecture — no global Redux or Zustand store.

| Concern | Solution |
|---|---|
| All remote data (products, sales, etc.) | TanStack Query (caching, background refetch, invalidation) |
| Authentication state (user, tenant) | React Context (`AuthProvider`) |
| UI state (modals open/closed, form values) | Local `useState` within each component |
| Toast notifications | Sonner (imperative `toast.success()` calls) |

TanStack Query is used in every page component with `useQuery` for data fetching and `useMutation` for writes. After a successful mutation, `queryClient.invalidateQueries()` triggers a background refetch of affected queries.

---

## 14. Security Design

### Authentication
- Passwords hashed with bcrypt (never stored in plaintext)
- JWT signed with HS256 + a 168h expiry; secret never leaves server
- Google OAuth session exchange via backend-to-backend call (session_id never exposed to the API in a way that reveals user data without going through the Emergent auth service)

### Authorization
- Every protected endpoint has a `Depends(get_current)` or `Depends(require_roles(...))` guard
- Role checks are server-side only — frontend role gating is UX only, never a security boundary

### Tenant Data Isolation
- Every MongoDB query includes `tenant_id` from the JWT-derived `AuthContext`
- NLQ AI pipeline: even if the LLM generates a query without a tenant filter, `_sanitize_pipeline()` forcibly prepends `{ $match: { tenant_id } }` before execution
- `$out` and `$merge` pipeline stages are stripped to prevent write operations from AI-generated queries

### Input Validation
- All request bodies validated by Pydantic v2 before reaching business logic
- Field injection prevented in `routes_procurement.py` by explicit allowlists: `allowed = {"name", "phone", "email", ...}`

### Payment Security
- Razorpay payment verification uses `hmac.compare_digest()` (constant-time comparison) to prevent timing attacks
- Webhook verification also uses HMAC-SHA256 with `compare_digest()`
- Razorpay key secret never sent to the browser

### File Upload Security
- Cloudinary uploads are signed server-side with a time-limited signature
- `api_secret` never transmitted to the browser
- Upload folder scoped to `ath-erp/{tenant_id}/...`

### Transport
- All secrets in `.env` (not committed to version control)
- CORS origins controlled by `CORS_ORIGINS` env var (defaults to `*` in dev; should be restricted in production)
- HTTPS assumed at the reverse proxy / CDN layer in production

---

## 15. Startup & Seeding

### Lifespan Context (`server.py`)

On every server start, the `lifespan` async function:

1. **Creates MongoDB indexes** for all 12 core collections:
   - `tenant_id` index on every collection (supports all tenant-scoped queries)
   - Unique index on `users.email` (global uniqueness)
   - Compound unique index on `(tenant_id, sku)` for products

2. **Runs `seed_demo()`** from `seed.py`:
   - Creates a `demo` tenant if not already present
   - Creates a demo owner user (`demo@smartledger.app`)
   - Populates sample products, locations, suppliers, purchase orders, and sales
   - Idempotent: checks for existing demo data before inserting

3. **Closes the Motor client** on shutdown (clean connection pool teardown)

Seed data can also be re-triggered via `POST /api/seed/demo` (owner role required).

---

## 16. Environment Configuration

All secrets and runtime configuration are loaded from `backend/.env`:

```ini
# MongoDB
MONGO_URL=mongodb+srv://...          # Atlas connection string or localhost URI
DB_NAME=smart_ledger                  # Database name

# JWT
JWT_SECRET=<random_256bit_hex>       # HMAC signing key
JWT_ALGORITHM=HS256                   # Default
JWT_EXPIRE_HOURS=168                  # 7 days

# AI
EMERGENT_LLM_KEY=<openai_api_key>    # OpenAI API key
LLM_MODEL=gpt-4o-mini                # Model name (overridable)
LLM_BASE_URL=                        # Optional: custom OpenAI-compatible base URL

# Payments
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook_secret>  # Optional

# Notifications
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=<token>
TWILIO_PHONE_NUMBER=+1...            # SMS sender number
TWILIO_WHATSAPP_FROM=whatsapp:+1...  # WhatsApp sender number

# TTS
ELEVENLABS_API_KEY=<key>
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Rachel (default)
ELEVENLABS_MODEL=eleven_multilingual_v2

# Image uploads
CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>

# CORS
CORS_ORIGINS=https://your-frontend.vercel.app  # Comma-separated list; * in dev
```

Frontend configuration is in `frontend/.env.local`:

```ini
REACT_APP_BACKEND_URL=http://localhost:8001  # Backend base URL
```

---

## 17. Deployment Topology

### Recommended Production Setup

```
                      ┌──────────────────────┐
                      │   CDN / Cloudflare   │
                      │   (SSL termination)  │
                      └──────────┬───────────┘
                                 │
             ┌───────────────────┴──────────────────┐
             │                                       │
  ┌──────────▼──────────┐              ┌────────────▼──────────────┐
  │   Static Hosting    │              │    App Server (Backend)    │
  │  Vercel / Netlify   │              │  Fly.io / Render / Railway │
  │                     │              │                            │
  │  npm run build      │              │  uvicorn server:app        │
  │  React SPA          │◄────HTTPS───►│  --host 0.0.0.0            │
  │  (static files)     │  /api/*      │  --port 8001               │
  └─────────────────────┘              └────────────┬───────────────┘
                                                    │  Motor async
                                                    │
                                       ┌────────────▼───────────────┐
                                       │       MongoDB Atlas         │
                                       │     M10+ dedicated cluster  │
                                       │   (auto-indexes on startup) │
                                       └────────────────────────────┘
```

### Local Development

```bash
# Terminal 1 — Backend
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Terminal 2 — Frontend
cd frontend
npm start   # CRA dev server on port 3000, proxies /api to :8001 via craco.config.js
```

### Running in Production

```bash
# Backend
uvicorn server:app --host 0.0.0.0 --port 8001 --workers 4

# Frontend (build once, serve static)
npm run build
# Deploy /build directory to Vercel/Netlify/S3
```

### Process Summary

| Process | Command | Port |
|---|---|---|
| FastAPI backend | `uvicorn server:app --port 8001` | 8001 |
| React dev server | `npm start` | 3000 |
| MongoDB | Atlas (managed) or `mongod` (local) | 27017 |

---

*Generated from source code analysis of Smart Ledger — July 2026*
