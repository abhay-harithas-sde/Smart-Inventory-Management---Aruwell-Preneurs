"""Auth + tenant signup routes."""
from fastapi import APIRouter, HTTPException, Depends
from db import db, strip_mongo_id
from auth import hash_password, verify_password, make_token, get_current, AuthContext, require_roles
from models import Tenant, User, SignupIn, LoginIn, InviteIn, Location

router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.post("/invite")
async def invite(inp: InviteIn, ctx: AuthContext = Depends(require_roles("owner", "manager"))):
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
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}
