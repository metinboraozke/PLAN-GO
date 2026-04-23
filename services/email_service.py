"""
Email gönderim servisi — Resend API (httpx ile, ek paket gerekmez).
Railway'de RESEND_API_KEY ve APP_URL env değişkenleri gerekli.
"""

import os
import httpx

_RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
_FROM_EMAIL     = "Planigo <noreply@planigo.app>"
_APP_URL        = os.getenv("APP_URL", "https://plan-go-production.up.railway.app")


async def send_verification_email(to_email: str, token: str) -> None:
    verify_url = f"{_APP_URL}/api/v1/auth/verify-email?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#FAF7F2;border-radius:16px;">
      <img src="https://planigo.app/logo.png" alt="Planigo" style="height:48px;margin-bottom:24px;">
      <h2 style="color:#2C3E35;margin:0 0 8px;">E-postanı Doğrula</h2>
      <p style="color:#7A8C82;margin:0 0 24px;">Planigo hesabını aktifleştirmek için aşağıdaki butona tıkla.</p>
      <a href="{verify_url}"
         style="display:inline-block;background:#4A7A5D;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;">
        E-postamı Doğrula
      </a>
      <p style="color:#A8C5B0;font-size:12px;margin-top:24px;">Bu bağlantı 24 saat geçerlidir.</p>
    </div>
    """
    await _send(to_email, "Planigo — E-postanı Doğrula", html)


async def send_password_reset_email(to_email: str, token: str) -> None:
    reset_url = f"{_APP_URL}/api/v1/auth/reset-password-page?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#FAF7F2;border-radius:16px;">
      <img src="https://planigo.app/logo.png" alt="Planigo" style="height:48px;margin-bottom:24px;">
      <h2 style="color:#2C3E35;margin:0 0 8px;">Şifre Sıfırlama</h2>
      <p style="color:#7A8C82;margin:0 0 24px;">Aşağıdaki butona tıklayarak yeni şifreni belirleyebilirsin.</p>
      <a href="{reset_url}"
         style="display:inline-block;background:#4A7A5D;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;">
        Şifremi Sıfırla
      </a>
      <p style="color:#A8C5B0;font-size:12px;margin-top:24px;">Bu bağlantı 1 saat geçerlidir. Sen istemediysen bu emaili yok say.</p>
    </div>
    """
    await _send(to_email, "Planigo — Şifre Sıfırlama", html)


async def _send(to: str, subject: str, html: str) -> None:
    if not _RESEND_API_KEY:
        print(f"[Email] RESEND_API_KEY eksik — {subject} gönderilemedi ({to})")
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {_RESEND_API_KEY}"},
                json={"from": _FROM_EMAIL, "to": [to], "subject": subject, "html": html},
            )
            if r.status_code >= 400:
                print(f"[Email] Gönderim hatası {r.status_code}: {r.text}")
    except Exception as e:
        print(f"[Email] İstisna: {e}")
