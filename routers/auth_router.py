"""
PLANİGO - Auth Router
Handles user registration, login, and current-user retrieval.
Extracted from main.py lines 186-272.
"""

from fastapi import APIRouter, HTTPException, Depends

from auth import hash_password, verify_password, create_access_token
from core.deps import get_current_user
from database import UserService, DatabaseManager, COLLECTIONS
from models import UserRegister, UserLogin, TokenResponse

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    """Register a new user."""
    existing = await UserService.find_by_email(user_data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayitli")

    user_doc = {
        "username": user_data.username,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "avatar_url": None,
        "bio": None,
        "total_trips": 0,
        "badges": [],
        "visited_countries": [],
    }

    user_id = await UserService.create(user_doc)
    if not user_id:
        raise HTTPException(status_code=500, detail="Kullanici olusturulamadi")

    token = create_access_token({
        "sub": user_id,
        "email": user_data.email,
        "username": user_data.username,
    })

    return TokenResponse(
        access_token=token,
        user_id=user_id,
        username=user_data.username,
        email=user_data.email,
        avatar_url=None,
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """Login with email and password."""
    user = await UserService.find_by_email(credentials.email)
    if not user:
        raise HTTPException(status_code=401, detail="E-posta veya sifre hatali")

    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="E-posta veya sifre hatali")

    user_id = user.get("_id", str(user.get("id", "")))

    token = create_access_token({
        "sub": str(user_id),
        "email": user.get("email"),
        "username": user.get("username"),
    })

    return TokenResponse(
        access_token=token,
        user_id=str(user_id),
        username=user.get("username", ""),
        email=user.get("email", ""),
        avatar_url=user.get("avatar_url"),
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user info."""
    user = await UserService.find_one(user_id=current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="Kullanici bulunamadi")
    user.pop("password_hash", None)
    return user


@router.post("/fcm-token")
async def update_fcm_token(body: dict, current_user: dict = Depends(get_current_user)):
    """Cihaz FCM token'ını güncelle (push notification için)."""
    token = (body.get("fcm_token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="fcm_token gerekli")
    await DatabaseManager.update_one(
        COLLECTIONS["users"],
        {"user_id": current_user["user_id"]},
        {"$set": {"fcm_token": token}}
    )
    return {"ok": True}
