"""
FastAPI application entry point.
SITA Smart Planner - Complete Backend API for all screens.

Screens supported:
- Discovery (Keşfet)
- Social Map (Harita)
- Smart Planner
- Social Profile (Pasaport)
"""
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from logging.handlers import RotatingFileHandler

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# ── File-based error logging ──────────────────────────────────────────────────
os.makedirs("logs", exist_ok=True)
_fh = RotatingFileHandler(
    "logs/error.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
)
_fh.setLevel(logging.WARNING)
_fh.setFormatter(logging.Formatter(
    "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
logging.getLogger().addHandler(_fh)
logger = logging.getLogger(__name__)
# ─────────────────────────────────────────────────────────────────────────────

from database import DatabaseManager, seed_data
from apscheduler.schedulers.asyncio import AsyncIOScheduler


# ============================================================================
#                           LIFESPAN MANAGEMENT
# ============================================================================

_scheduler = AsyncIOScheduler(timezone="UTC")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages application lifecycle events."""
    try:
        await DatabaseManager.connect()
        await seed_data()
        print("[OK] MongoDB baglantisi kuruldu - canli veri kullaniliyor.")
    except Exception as e:
        # Non-fatal: server starts in mock-only mode when DB is unreachable
        print("[WARN] MongoDB baglanamadi (" + type(e).__name__ + ") - mock veri ile devam ediliyor.")

    # 4 saatlik fiyat tarama job'u — sadece DB bağlıysa başlat
    try:
        from routers.planner_router import rescrape_active_plans
        from services.push_service import send_dream_vacation_push
        _scheduler.add_job(
            rescrape_active_plans,
            "interval",
            hours=4,
            id="rescrape_plans",
            replace_existing=True,
            misfire_grace_time=300,
        )
        _scheduler.add_job(
            send_dream_vacation_push,
            "interval",
            hours=4,
            id="dream_vacation_push",
            replace_existing=True,
            misfire_grace_time=300,
        )
        _scheduler.start()
        print("[OK] 4 saatlik scraping + push notification scheduler baslatildi.")
    except Exception as e:
        print(f"[WARN] Scheduler baslatma hatasi: {e}")

    print("\n SITA Smart Planner  Discover v2 aktif!")
    print("   GET /api/v1/discover/categories")
    print("   GET /api/v1/discover/hero")
    print("   GET /api/v1/discover/trending")
    print("   GET /api/v1/discover/dealscategory=vizesiz|bte-dostu|hafta-sonu")
    print()

    yield

    if _scheduler.running:
        _scheduler.shutdown(wait=False)
    await DatabaseManager.disconnect()
    print(" SITA Operasyon Merkezi kapatld")


# ============================================================================
#                           FASTAPI APPLICATION
# ============================================================================

app = FastAPI(
    title="SITA Smart Planner API",
    description="Akıllı seyahat planlama ve fiyat takip sistemi - Tüm ekranlar için backend",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # JWT header-based auth, cookie kullanılmıyor
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
#                              HEALTH CHECK
# ============================================================================

@app.get("/", tags=["Health"])
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy", 
        "message": "SITA Smart Planner API is running",
        "version": "2.0.0",
        "screens": ["discovery", "map", "planner", "profile"],
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    """Detailed health check."""
    db_status = "disconnected"
    try:
        if DatabaseManager._client is not None:
            await DatabaseManager._client.admin.command("ping")
            db_status = "connected"
    except Exception:
        db_status = "error"
    return {
        "status": "healthy",
        "database": db_status,
        "scraper": "standby",
        "ai_planner": "skeleton_mode",
        "timestamp": datetime.utcnow().isoformat()
    }


# ============================================================================
#                  AUTHENTICATION ENDPOINTS → routers/auth_router.py
# ============================================================================
from routers.auth_router import router as auth_router
app.include_router(auth_router)


# ============================================================================
#             DISCOVERY ENDPOINTS → routers/discovery_router.py
# ============================================================================
from routers.discovery_router import router as discovery_router
app.include_router(discovery_router)


# ============================================================================
#               PINS ENDPOINTS → routers/pins_router.py
# ============================================================================
from routers.pins_router import router as pins_router
app.include_router(pins_router)


# ============================================================================
#               EVENTS ENDPOINTS → routers/events_router.py
# ============================================================================
from routers.events_router import router as events_router
app.include_router(events_router)


# ============================================================================
#               AI ENDPOINTS → routers/ai_router.py
# ============================================================================
from routers.ai_router import router as ai_router
app.include_router(ai_router)


# ============================================================================
#           SMART PLANNER ENDPOINTS → routers/planner_router.py
# ============================================================================
from routers.planner_router import router as planner_router
app.include_router(planner_router)


# ============================================================================
#         SOCIAL PROFILE ENDPOINTS → routers/profile_router.py
# ============================================================================
from routers.profile_router import router as profile_router
app.include_router(profile_router)


# ============================================================================
#         STORY ENDPOINTS → routers/story_router.py
# ============================================================================
from routers.story_router import router as story_router
app.include_router(story_router)


# ============================================================================
#                           ERROR HANDLERS
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler — stack trace logs/error.log'a yazılır, kullanıcıya sızdırılmaz."""
    logger.error(f"[UNHANDLED] {request.method} {request.url.path} — {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar dene."}
    )



# ============================================================================
#                           MAIN ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
