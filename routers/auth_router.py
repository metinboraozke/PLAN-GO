"""
PLANİGO - Auth Router
Handles user registration, login, email verification, and password reset.
"""

import secrets
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from bson import ObjectId

from auth import hash_password, verify_password, create_access_token
from core.deps import get_current_user
from database import UserService, AuthTokenService, DatabaseManager, COLLECTIONS
from models import (
    UserRegister, UserLogin, TokenResponse,
    ForgotPasswordRequest, ResetPasswordRequest, ResendVerificationRequest,
)
from services.email_service import send_verification_email, send_password_reset_email

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    existing = await UserService.find_by_email(user_data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayitli")

    user_doc = {
        "username":      user_data.username,
        "email":         user_data.email,
        "password_hash": hash_password(user_data.password),
        "avatar_url":    None,
        "bio":           None,
        "total_trips":   0,
        "badges":        [],
        "visited_countries": [],
        "email_verified": False,
    }

    user_id = await UserService.create(user_doc)
    if not user_id:
        raise HTTPException(status_code=500, detail="Kullanici olusturulamadi")

    # Send verification email (non-blocking — don't fail registration if email fails)
    try:
        verify_token = secrets.token_urlsafe(32)
        await AuthTokenService.create(verify_token, user_id, "email_verify", 86400)
        await send_verification_email(user_data.email, verify_token)
    except Exception as e:
        print(f"[Auth] Dogrulama emaili gonderilemedi: {e}")

    token = create_access_token({
        "sub":      user_id,
        "email":    user_data.email,
        "username": user_data.username,
    })

    return TokenResponse(
        access_token=token,
        user_id=user_id,
        username=user_data.username,
        email=user_data.email,
        avatar_url=None,
        email_verified=False,
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await UserService.find_by_email(credentials.email)
    if not user:
        raise HTTPException(status_code=401, detail="E-posta veya sifre hatali")

    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="E-posta veya sifre hatali")

    user_id = str(user.get("_id", user.get("id", "")))

    token = create_access_token({
        "sub":      user_id,
        "email":    user.get("email"),
        "username": user.get("username"),
    })

    return TokenResponse(
        access_token=token,
        user_id=user_id,
        username=user.get("username", ""),
        email=user.get("email", ""),
        avatar_url=user.get("avatar_url"),
        email_verified=user.get("email_verified", True),
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
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


# ============================================================
# EMAIL VERIFICATION
# ============================================================

@router.get("/verify-email", response_class=HTMLResponse)
async def verify_email(token: str):
    record = await AuthTokenService.find_valid(token, "email_verify")
    if not record:
        return _html_page("Geçersiz veya Süresi Dolmuş", "Bu doğrulama bağlantısı geçersiz ya da süresi dolmuş. Uygulamadan yeniden gönderebilirsin.", success=False)

    collection = DatabaseManager.get_collection(COLLECTIONS["users"])
    await collection.update_one(
        {"_id": ObjectId(record["user_id"])},
        {"$set": {"email_verified": True}},
    )
    await AuthTokenService.consume(token)
    return _html_page("E-posta Doğrulandı!", "Hesabın başarıyla doğrulandı. Uygulamaya dönebilirsin.", success=True)


@router.post("/resend-verification")
async def resend_verification(body: ResendVerificationRequest):
    user = await UserService.find_by_email(body.email)
    if not user or user.get("email_verified", False):
        # Email bulunamasa da 200 döner (enumeration önleme)
        return {"ok": True}

    user_id = str(user["_id"])
    verify_token = secrets.token_urlsafe(32)
    await AuthTokenService.create(verify_token, user_id, "email_verify", 86400)
    await send_verification_email(body.email, verify_token)
    return {"ok": True}


# ============================================================
# PASSWORD RESET
# ============================================================

@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    user = await UserService.find_by_email(body.email)
    if user:
        user_id = str(user["_id"])
        reset_token = secrets.token_urlsafe(32)
        await AuthTokenService.create(reset_token, user_id, "password_reset", 3600)
        await send_password_reset_email(body.email, reset_token)
    # Her durumda 200 döner (kullanıcı tespiti engellenir)
    return {"ok": True, "message": "Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi."}


@router.get("/reset-password-page", response_class=HTMLResponse)
async def reset_password_page(token: str):
    record = await AuthTokenService.find_valid(token, "password_reset")
    if not record:
        return _html_page("Geçersiz veya Süresi Dolmuş", "Bu şifre sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Uygulamadan yeniden talep edebilirsin.", success=False)

    return HTMLResponse(content=f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Şifre Sıfırla — Planigo</title>
  <style>
    body{{font-family:sans-serif;background:#FAF7F2;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box;}}
    .card{{background:#fff;border-radius:20px;padding:36px 32px;max-width:400px;width:100%;box-shadow:0 8px 32px rgba(44,62,53,.12);}}
    h2{{color:#2C3E35;margin:0 0 8px;}}
    p{{color:#7A8C82;margin:0 0 24px;font-size:14px;}}
    input{{width:100%;padding:13px 16px;border:1.5px solid #D8E5DC;border-radius:12px;font-size:15px;box-sizing:border-box;outline:none;color:#2C3E35;background:#F0EBE3;margin-bottom:12px;}}
    input:focus{{border-color:#4A7A5D;background:#fff;}}
    button{{width:100%;padding:14px;background:#4A7A5D;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;}}
    button:disabled{{opacity:.6;cursor:not-allowed;}}
    #msg{{display:none;padding:12px;border-radius:10px;font-size:14px;text-align:center;margin-top:12px;}}
    .err{{background:rgba(184,84,80,.08);color:#B85450;border:1px solid rgba(184,84,80,.2);}}
    .ok{{background:rgba(74,122,93,.08);color:#2C6B47;border:1px solid rgba(74,122,93,.2);}}
  </style>
</head>
<body>
  <div class="card">
    <h2>Yeni Şifre Belirle</h2>
    <p>En az 6 karakterli yeni bir şifre gir.</p>
    <input type="password" id="pw" placeholder="Yeni şifre" minlength="6">
    <input type="password" id="pw2" placeholder="Şifreyi tekrarla" minlength="6">
    <button id="btn" onclick="doReset()">Şifremi Sıfırla</button>
    <div id="msg"></div>
  </div>
  <script>
    async function doReset() {{
      const pw  = document.getElementById('pw').value;
      const pw2 = document.getElementById('pw2').value;
      const msg = document.getElementById('msg');
      const btn = document.getElementById('btn');
      if (pw.length < 6) {{ show(msg,'Şifre en az 6 karakter olmalı','err'); return; }}
      if (pw !== pw2)    {{ show(msg,'Şifreler eşleşmiyor','err'); return; }}
      btn.disabled = true;
      btn.textContent = 'Kaydediliyor...';
      const r = await fetch('/api/v1/auth/reset-password', {{
        method:'POST', headers:{{'Content-Type':'application/json'}},
        body: JSON.stringify({{token:'{token}', new_password:pw}})
      }});
      if (r.ok) {{
        show(msg,'Şifren güncellendi! Uygulamaya dönüp giriş yapabilirsin.','ok');
        btn.style.display='none';
      }} else {{
        const d = await r.json().catch(()=>({{}}));
        show(msg, d.detail || 'Bir hata oluştu.','err');
        btn.disabled=false; btn.textContent='Şifremi Sıfırla';
      }}
    }}
    function show(el,text,cls){{ el.textContent=text; el.className=cls; el.style.display='block'; }}
  </script>
</body>
</html>""")


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    record = await AuthTokenService.find_valid(body.token, "password_reset")
    if not record:
        raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş sıfırlama bağlantısı")

    collection = DatabaseManager.get_collection(COLLECTIONS["users"])
    await collection.update_one(
        {"_id": ObjectId(record["user_id"])},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    await AuthTokenService.consume(body.token)
    return {"ok": True}


# ============================================================
# HELPERS
# ============================================================

def _html_page(title: str, body: str, success: bool) -> HTMLResponse:
    color  = "#2C6B47" if success else "#B85450"
    bg     = "rgba(74,122,93,.08)" if success else "rgba(184,84,80,.08)"
    border = "rgba(74,122,93,.2)" if success else "rgba(184,84,80,.2)"
    icon   = "✓" if success else "✕"
    return HTMLResponse(content=f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title} — Planigo</title>
  <style>
    body{{font-family:sans-serif;background:#FAF7F2;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box;}}
    .card{{background:#fff;border-radius:20px;padding:36px 32px;max-width:400px;width:100%;box-shadow:0 8px 32px rgba(44,62,53,.12);text-align:center;}}
    .icon{{width:64px;height:64px;border-radius:50%;background:{bg};border:2px solid {border};display:flex;align-items:center;justify-content:center;font-size:28px;color:{color};margin:0 auto 20px;}}
    h2{{color:#2C3E35;margin:0 0 8px;}}
    p{{color:#7A8C82;font-size:14px;margin:0;}}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <h2>{title}</h2>
    <p>{body}</p>
  </div>
</body>
</html>""")
