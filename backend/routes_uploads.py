"""Cloudinary signed uploads for product images.
Pattern: frontend requests a signature from us → uploads file directly to Cloudinary.
Backend never touches the file bytes.
"""
import os
import time
import cloudinary
import cloudinary.utils
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current, AuthContext, require_roles

router = APIRouter(prefix="/uploads", tags=["uploads"])

cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
    secure=True,
)


class SignIn(BaseModel):
    folder: str = "products"      # ath-erp/products/<tenant_id>
    public_id: str | None = None  # optional stable id


@router.post("/sign")
async def sign(inp: SignIn, ctx: AuthContext = Depends(require_roles("owner", "manager", "warehouse"))):
    """Return signature so the browser can upload directly to Cloudinary."""
    timestamp = int(time.time())
    folder = f"ath-erp/{ctx.tenant_id}/{inp.folder}"

    params_to_sign = {"timestamp": timestamp, "folder": folder}
    if inp.public_id:
        params_to_sign["public_id"] = inp.public_id

    signature = cloudinary.utils.api_sign_request(params_to_sign, cloudinary.config().api_secret)

    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": cloudinary.config().cloud_name,
        "api_key": cloudinary.config().api_key,
        "folder": folder,
        "upload_url": f"https://api.cloudinary.com/v1_1/{cloudinary.config().cloud_name}/image/upload",
    }
