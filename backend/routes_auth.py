"""Auth + tenant signup routes."""
import httpx
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from typing import Optional
from db import db, strip_mongo_id
from auth import hash_password, verify_password, make_token, get_current, AuthContext, require_roles
from models import Tenant, User, SignupIn, LoginIn, InviteIn, Location
from email_utils import send_email, invite_email_html

router = APIRouter(prefix="/auth", tags=["auth"])

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


@router.post("/signup")
async def signup(inp: SignupIn):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")

    tenant = Tenant(name=inp.business_name, business_type=inp.business_type)
    await db.tenants.insert_one(tenant.model_dump())

    # default location
    loc = Location(tenant_id=tenant.id, name="Main Store")
    await db.locations.insert_one(loc.model_dump())

    user = User(
        tenant_id=tenant.id,
        email=inp.email.lower(),
        name=inp.name,
        role="owner",
        password_hash=hash_password(inp.password),
    )
    await db.users.insert_one(user.model_dump())

    token = make_token(user.id, tenant.id, user.role)
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role},
        "tenant": {"id": tenant.id, "name": tenant.name, "business_type": tenant.business_type, "currency": tenant.currency},
    }


@router.post("/login")
async def login(inp: LoginIn):
    doc = await db.users.find_one({"email": inp.email.lower()})
    if not doc or not verify_password(inp.password, doc["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if not doc.get("active", True):
        raise HTTPException(403, "Account disabled")
    tenant = strip_mongo_id(await db.tenants.find_one({"id": doc["tenant_id"]}))
    token = make_token(doc["id"], doc["tenant_id"], doc["role"])
    return {
        "token": token,
        "user": {"id": doc["id"], "email": doc["email"], "name": doc["name"], "role": doc["role"]},
        "tenant": tenant,
    }


@router.get("/me")
async def me(ctx: AuthContext = Depends(get_current)):
    user = strip_mongo_id(await db.users.find_one({"id": ctx.user_id}))
    tenant = strip_mongo_id(await db.tenants.find_one({"id": ctx.tenant_id}))
    if user:
        user.pop("password_hash", None)
    return {"user": user, "tenant": tenant}


@router.get("/users")
async def list_users(ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    users = await db.users.find({"tenant_id": ctx.tenant_id}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users


@router.post("/google/session")
async def google_session(x_session_id: Optional[str] = Header(None, alias="X-Session-ID")):
    """Exchange Emergent Google session_id for our own JWT.
    - Existing email → log into their tenant.
    - New email → auto-create tenant, user becomes Owner.
    """
    if not x_session_id:
        raise HTTPException(400, "Missing X-Session-ID header")

    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": x_session_id})
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Google session")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Auth service unavailable: {e}")

    email = (data.get("email") or "").lower()
    name = data.get("name") or email.split("@")[0]
    if not email:
        raise HTTPException(400, "No email returned from Google")

    existing = await db.users.find_one({"email": email})
    if existing:
        if not existing.get("active", True):
            raise HTTPException(403, "Account disabled")
        user = existing
    else:
        # Auto-create tenant + user (Option C - new email gets own workspace as Owner)
        tenant = Tenant(name=f"{name}'s Workspace", business_type="retail")
        await db.tenants.insert_one(tenant.model_dump())
        await db.locations.insert_one(Location(tenant_id=tenant.id, name="Main Store").model_dump())
        new_user = User(
            tenant_id=tenant.id,
            email=email,
            name=name,
            role="owner",
            password_hash="",  # Google-only account
        )
        await db.users.insert_one(new_user.model_dump())
        user = new_user.model_dump()

    tenant = strip_mongo_id(await db.tenants.find_one({"id": user["tenant_id"]}))
    token = make_token(user["id"], user["tenant_id"], user["role"])
    return {
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]},
        "tenant": tenant,
    }


@router.post("/invite")
async def invite(inp: InviteIn, request: Request, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
    if await db.users.find_one({"email": inp.email.lower()}):
        raise HTTPException(400, "Email already exists")
    user = User(
        tenant_id=ctx.tenant_id,
        email=inp.email.lower(),
        name=inp.name,
        role=inp.role,
        password_hash=hash_password(inp.password),
    )
    await db.users.insert_one(user.model_dump())

    # Send invite email (non-blocking — failure doesn't break the invite)
    tenant = await db.tenants.find_one({"id": ctx.tenant_id})
    tenant_name = tenant["name"] if tenant else "Smart Ledger"
    login_url = str(request.base_url).rstrip("/").replace("http://", "https://")
    # Use frontend origin if available via Referer/Origin header
    origin = request.headers.get("origin") or request.headers.get("referer", "").rstrip("/")
    if origin:
        login_url = origin.rstrip("/") + "/login"
    else:
        login_url = login_url + "/login"

    html, plain = invite_email_html(
        name=inp.name,
        email=inp.email.lower(),
        password=inp.password,
        role=inp.role,
        tenant_name=tenant_name,
        login_url=login_url,
    )
    email_sent = await send_email(
        to=inp.email.lower(),
        subject=f"You've been invited to {tenant_name} on Smart Ledger",
        html=html,
        text=plain,
    )

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "email_sent": email_sent,
    }
