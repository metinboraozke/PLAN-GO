"""PLANİGO — Firebase Admin SDK push notification gönderici."""
import os
import logging
import firebase_admin
from firebase_admin import credentials, messaging

logger = logging.getLogger(__name__)
_firebase_app = None


def _get_firebase_app():
    global _firebase_app
    if _firebase_app is None:
        sa_env = os.getenv("FIREBASE_SERVICE_ACCOUNT", "firebase-service-account.json")
        # Env var JSON string mi yoksa dosya yolu mu?
        if sa_env.strip().startswith("{"):
            import json
            cred = credentials.Certificate(json.loads(sa_env))
        else:
            cred = credentials.Certificate(sa_env)
        _firebase_app = firebase_admin.initialize_app(cred)
    return _firebase_app


async def send_dream_vacation_push() -> dict:
    """FCM token'ı olan tüm kullanıcılara 'hayalindeki tatil' push'u gönder (4 saatlik job)."""
    from database import UserService
    users = await UserService.find_with_fcm_tokens()
    sent, failed = 0, 0
    for user in users:
        ok = send_push(
            fcm_token=user.get("fcm_token", ""),
            title="✈️ Hayalindeki tatil seni bekliyor!",
            body="Planlarını keşfet, en iyi fırsatları kaçırma.",
            data={"action": "open_planner"},
        )
        if ok:
            sent += 1
        else:
            failed += 1
    logger.info(f"[Push] Dream vacation: {sent} gönderildi, {failed} başarısız")
    return {"sent": sent, "failed": failed}


def send_push(fcm_token: str, title: str, body: str, data: dict = None) -> bool:
    """Tek cihaza push notification gönder. True = başarılı."""
    if not fcm_token:
        return False
    try:
        _get_firebase_app()
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=fcm_token,
        )
        messaging.send(message)
        logger.info(f"[Push] Gönderildi → {fcm_token[:20]}...")
        return True
    except Exception as e:
        logger.warning(f"[Push] Gönderilemedi: {e}")
        return False
