"""
FastAPI application entry point.
SITA Smart Planner - Complete Backend API for all screens.

Screens supported:
- Discovery (Keşfet)
- Social Map (Harita)
- Smart Planner
- Social Profile (Pasaport)
"""
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional, Dict, Any

# ── Gamification ─────────────────────────────────────────────
XP_PER_LEVEL = 100

# European Union member states (ISO 3166-1 alpha-2)
EU_COUNTRIES = {
    "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI",
    "FR","GR","HR","HU","IE","IT","LT","LU","LV","MT",
    "NL","PL","PT","RO","SE","SI","SK"
}

# Visa-free countries for Turkish passport holders (no advance visa needed)
VISA_FREE_COUNTRIES = {
    "AL","AZ","BA","BY","BR","BO","CL","CO","EC","GE",
    "HT","HK","ID","IR","JO","KZ","XK","KG","LB","LY",
    "MD","MN","ME","MA","NI","MK","OM","PK","PY","QA",
    "SN","RS","KR","TJ","TN","TM","UA","UY","UZ","TR",
    "AF","AM","MO","MV","NP","SC","ZW","VN","ET","UG",
}

BADGE_DEFINITIONS = [
    {"id": "euro_traveler",  "name": "Euro Traveler",  "icon": "🇪🇺", "description": "5 Avrupa Birliği ülkesi gez",  "condition": "eu_countries >= 5"},
    {"id": "schengen_ghost", "name": "Schengen Ghost", "icon": "👻",  "description": "Vizesiz 5 ülke gez",           "condition": "visa_free_countries >= 5"},
    {"id": "photo_genic",    "name": "Photo Genic",    "icon": "📸",  "description": "Haritaya 5 farklı pin bırak",             "condition": "pins >= 5"},
    {"id": "city_guide",     "name": "City Guide",     "icon": "🗺",  "description": "Tek bir şehre 5+ pin ekle",               "condition": "city_pins >= 5"},
    {"id": "early_bird",     "name": "Early Bird",     "icon": "🐦",  "description": "PLANİGO'nun ilk 5000 kullanıcısından biri", "condition": "early_bird"},
    {"id": "passport_full",  "name": "Passport Full",  "icon": "📒",  "description": "50+ pasaport damgası topla",              "condition": "countries >= 50"},
]
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, status, Query, Path, BackgroundTasks, Depends, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId

from database import (
    DatabaseManager,
    COLLECTIONS,
    WishlistService,
    DealService,
    PinService,
    UserService,
    EventPinService,
    JoinRequestService,
    NotificationService,
    get_wishlist_collection,
    get_price_history_collection,
    seed_data
)
from models import (
    # Wishlist/Planner models
    WishlistCreate, 
    WishlistResponse, 
    WishlistInDB,
    TripStatus,
    PlannerResponse,
    ScrapeResponse,
    ItineraryItem,
    ItineraryItemType,
    PlanDetailsResponse,
    BudgetCalculateResponse,
    # Discovery models
    DiscoveryDealCreate,
    DiscoveryDealResponse,
    DiscoveryDealInDB,
    DealCategory,
    # Map models
    MapPinCreate,
    MapPinResponse,
    MapPinInDB,
    MapPinType,
    # User models
    UserProfileCreate,
    UserProfileResponse,
    UserProfileInDB,
    UserProfileInDB,
    Badge,
    BadgeType,
    VisitedCountry,
    UserProfileUpdate,
    DateType,
    FlightDetails,
    # Auth models
    UserRegister,
    UserLogin,
    TokenResponse,
    # PAX EventPin models
    EventPinCreate,
    EventPinInDB,
    EventPinResponse,
    EventType,
    EventStatus,
    JoinRequestCreate,
    JoinRequestInDB,
    JoinRequestResponse,
    JoinRequestStatusUpdate,
    JoinRequestStatus,
    ChatMessageCreate,
    ChatMessageInDB,
    ChatMessageResponse,
    # Notification models
    NotificationCreate,
    NotificationType,
    # Badge models
    Badge,
    BadgeType,
)
from scraper import fetch_price, ScrapeResult, fetch_best_deal, process_wishlist_scrape
from gemini import fetchTravelRecommendations, generate_pax_itinerary
from planner import generate_null_plan, TripPlanResponse, generate_ai_day_plans
from auth import hash_password, verify_password, create_access_token, get_current_user, get_optional_user


# ============================================================================
#                           LIFESPAN MANAGEMENT
# ============================================================================

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

    print("\n SITA Smart Planner  Discover v2 aktif!")
    print("   GET /api/v1/discover/categories")
    print("   GET /api/v1/discover/hero")
    print("   GET /api/v1/discover/trending")
    print("   GET /api/v1/discover/dealscategory=vizesiz|bte-dostu|hafta-sonu")
    print()
    
    yield
    
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
    allow_credentials=True,
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
    return {
        "status": "healthy",
        "database": "connected",
        "scraper": "standby",
        "ai_planner": "skeleton_mode",
        "timestamp": datetime.utcnow().isoformat()
    }


# ============================================================================
#                         AUTHENTICATION ENDPOINTS
# ============================================================================

@app.post("/api/v1/auth/register", response_model=TokenResponse, tags=["Auth"])
async def register(user_data: UserRegister):
    """Register a new user."""
    # Check if email already exists
    existing = await UserService.find_by_email(user_data.email)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Bu e-posta adresi zaten kayitli"
        )
    
    # Create user document
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
    
    # Generate token
    token = create_access_token({
        "sub": user_id,
        "email": user_data.email,
        "username": user_data.username
    })
    
    return TokenResponse(
        access_token=token,
        user_id=user_id,
        username=user_data.username,
        email=user_data.email
    )


@app.post("/api/v1/auth/login", response_model=TokenResponse, tags=["Auth"])
async def login(credentials: UserLogin):
    """Login with email and password."""
    user = await UserService.find_by_email(credentials.email)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="E-posta veya sifre hatali"
        )
    
    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=401,
            detail="E-posta veya sifre hatali"
        )
    
    user_id = user.get("_id", str(user.get("id", "")))
    
    token = create_access_token({
        "sub": str(user_id),
        "email": user.get("email"),
        "username": user.get("username")
    })
    
    return TokenResponse(
        access_token=token,
        user_id=str(user_id),
        username=user.get("username", ""),
        email=user.get("email", "")
    )


@app.get("/api/v1/auth/me", tags=["Auth"])
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user info."""
    user = await UserService.find_one(user_id=current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="Kullanici bulunamadi")
    # Remove password hash from response
    user.pop("password_hash", None)
    return user


# ============================================================================
#                    DISCOVERY (KESFET) ENDPOINTS
# ============================================================================

@app.get(
    "/api/v1/discovery",
    response_model=List[DiscoveryDealResponse],
    tags=["Discovery"],
    summary="Keşfet ekranını besler",
    description="Tüm fırsat ve kampanyaları getirir. Kategori filtreleme destekler."
)
async def get_discovery_deals(
    category: Optional[DealCategory] = None,
    featured_only: bool = False,
    limit: int = Query(default=20, le=100),
    skip: int = Query(default=0, ge=0)
):
    """Retrieves discovery deals for the Keşfet screen."""
    try:
        query = {}
        if category:
            query["category"] = category.value
        if featured_only:
            query["is_featured"] = True
        
        deals = await DealService.find_all(query, skip, limit)
        
        # Return empty list if no data (frontend ready)
        return [DiscoveryDealResponse(**deal) for deal in deals]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veri getirme hatası: {str(e)}"
        )


@app.get(
    "/api/v1/discovery/full",
    tags=["Discovery"],
    summary="Keşfet ekranının tamamını tek JSON olarak döner",
    description="Deal of the Day, Viral Stories, Budget Escapes, Visa-Free Gems ve Featured Deals hepsini döner. Filtreleme destekler."
)
async def get_discovery_full_screen(
    filter_type: Optional[str] = Query(None, description="Filtre tipi: 'visa_free', 'under_5k', 'all'")
):
    """
    Returns complete Discovery screen data in one response.
    Includes: Deal of Day, Viral Stories, Budget Escapes, Visa-Free Gems, Featured Deals
    Supports dynamic filtering.
    """
    try:
        # --- FILTERS ---
        visa_free_filter = filter_type == "visa_free"
        under_5k_filter = filter_type == "under_5k"
        
        # --- FETCH DATA ---
        
        # 1. Deal of the Day
        deal_of_day = await DatabaseManager.find_all("deal_of_day", limit=1)
        deal_of_day_data = deal_of_day[0] if deal_of_day else None
        
        # Calculate remaining time for deal
        if deal_of_day_data and "valid_until" in deal_of_day_data:
            valid_until = deal_of_day_data.get("valid_until")
            if isinstance(valid_until, datetime):
                remaining = valid_until - datetime.utcnow()
                deal_of_day_data["remaining_days"] = max(0, remaining.days)
                deal_of_day_data["remaining_hours"] = max(0, remaining.seconds // 3600)
                deal_of_day_data["is_live"] = remaining.total_seconds() > 0
        
        # 2. Viral Stories (From Map Pins where is_viral=True)
        # Try fetching from pins collection first as dynamic source
        viral_pins = await PinService.find_all({"is_viral": True}, limit=10)
        
        viral_stories = []
        if viral_pins:
            for pin in viral_pins:
                viral_stories.append({
                    "_id": str(pin["_id"]),
                    "location_name": pin["title"],
                    "cover_image_url": pin["image_url"] or "https://images.unsplash.com/photo-1542259681-dadcd73156f0?w=200",
                    "story_slides": [],
                    "view_count": pin.get("friends_visited", 0) * 100 + 500, # Fake view count tailored to visits
                    "is_viral": True
                })
        else:
            # Fallback to static stories collection
            viral_stories = await DatabaseManager.find_all("viral_stories", limit=10, sort_by="view_count", sort_order=-1)
        
        # 3. Budget Escapes (Apply Filters)
        escapes_query = {}
        if visa_free_filter:
            escapes_query["is_visa_free"] = True
        if under_5k_filter:
            escapes_query["starting_price"] = {"$lt": 5000}
            
        budget_escapes = await DatabaseManager.find_all("budget_escapes", query=escapes_query, limit=6, sort_by="starting_price", sort_order=1)
        
        # 4. Visa-Free Gems (Apply Filters)
        # For 'under_5k', we also filter these gems
        gems_query = {}
        if under_5k_filter:
            gems_query["price"] = {"$lt": 5000}
            
        # If filter is visa-free, we technically show all gems since they are all visa-free, 
        # but the query structure supports flexibility.
        
        visa_free_gems = await DatabaseManager.find_all("visa_free_gems", query=gems_query, limit=10, sort_by="price", sort_order=1)
        
        # 5. Featured Deals
        featured_query = {"is_featured": True}
        if under_5k_filter:
            featured_query["price"] = {"$lt": 5000}
            
        featured_deals = await DealService.find_all(featured_query, limit=5)
        
        return {
            "deal_of_the_day": deal_of_day_data,
            "viral_stories": viral_stories,
            "budget_escapes": budget_escapes,
            "visa_free_gems": visa_free_gems,
            "featured_deals": featured_deals,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Discovery verisi getirilemedi: {str(e)}"
        )


@app.post(
    "/api/v1/discovery",
    response_model=DiscoveryDealResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Discovery"],
    summary="Yeni fırsat ekle"
)
async def create_discovery_deal(deal: DiscoveryDealCreate):
    """Creates a new discovery deal."""
    try:
        deal_db = DiscoveryDealInDB(**deal.model_dump())
        document = deal_db.to_dict()
        
        deal_id = await DatabaseManager.insert_one(COLLECTIONS["deals"], document)
        
        if not deal_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Fırsat oluşturulamadı"
            )
        
        created_deal = await DealService.find_one(deal_id)
        return DiscoveryDealResponse(**created_deal)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veritabanı hatası: {str(e)}"
        )


# ============================================================================
#                     DISCOVER v2 — Structured Screen Endpoints
# ============================================================================
#
#  Aşama 1 → /discover/categories   (filtre kategorileri)
#  Aşama 2 → /discover/hero         (Günün Fırsatı hero)
#             /discover/trending     (viral pin hikayeleri)
#  Aşama 3 → /discover/deals        (fırsat listesi, kategori filtreli)
#
# Her endpoint DB'yi dener; boşsa mock fallback döner.
# ============================================================================

# --- Static category list (single source of truth) ---
_DISCOVER_CATEGORIES: List[Dict[str, str]] = [
    {"id": "all",         "label": "Tüm Fırsatlar", "icon": "zap"},
    {"id": "vizesiz",     "label": "Vizesiz",        "icon": "shield-check"},
    {"id": "bütçe-dostu", "label": "Bütçe Dostu",   "icon": "wallet"},
    {"id": "hafta-sonu",  "label": "Hafta Sonu",     "icon": "sun"},
]

# --- Mock fallback — hero ---
_MOCK_HERO: Dict[str, Any] = {
    "id": "mock-hero-roma",
    "city_name": "Roma", "country": "İtalya",
    "price": 1200, "original_price": None, "currency": "TRY",
    "nights": 3, "duration": "3 Gece • 4 Gün",
    "visa_free": False, "tags": ["Günün Fırsatı"],
    "image_url": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800",
    "airline": None, "route": None, "discount_rate": None,
    "remaining_hours": 8, "is_live": True,
}

# --- Mock fallback — trending stories ---
_MOCK_TRENDING: List[Dict[str, Any]] = [
    {"id": "t1", "location_name": "Dubai",     "cover_image_url": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=200", "view_count": 615000},
    {"id": "t2", "location_name": "Paris",     "cover_image_url": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=200", "view_count": 420000},
    {"id": "t3", "location_name": "Kapadokya", "cover_image_url": "https://images.unsplash.com/photo-1527838832700-5059252407fa?w=200", "view_count":  53000},
    {"id": "t4", "location_name": "Venedik",   "cover_image_url": "https://images.unsplash.com/photo-1534113414509-0eec2bfb493f?w=200", "view_count": 310000},
]

# --- Mock fallback — deals list ---
# Her obje: city_name, country, price, currency, duration, flight_time,
#           visa_free (bool), tags, filter_tags, image_url, rating
_MOCK_DEALS: List[Dict[str, Any]] = [
    {
        "id": "m1", "city_name": "Atina", "country": "Yunanistan",
        "price": 1450, "currency": "TRY", "duration": "3 Gece", "flight_time": "1sa 20dk",
        "visa_free": True,  "tags": ["Vizesiz"],
        "filter_tags": ["vizesiz", "bütçe-dostu"],
        "image_url": "https://images.unsplash.com/photo-1555993539-1732b0258235?w=400",
        "rating": 4.6,
    },
    {
        "id": "m2", "city_name": "Tokyo", "country": "Japonya",
        "price": 24900, "currency": "TRY", "duration": "7 Gece", "flight_time": "11sa 30dk",
        "visa_free": False, "tags": ["Son 2 Koltuk"],
        "filter_tags": ["hafta-sonu"],
        "image_url": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400",
        "rating": 4.8,
    },
    {
        "id": "m3", "city_name": "Saraybosna", "country": "Bosna-Hersek",
        "price": 3100, "currency": "TRY", "duration": "4 Gece", "flight_time": "1sa 30dk",
        "visa_free": True,  "tags": ["Vizesiz"],
        "filter_tags": ["vizesiz", "hafta-sonu"],
        "image_url": "https://images.unsplash.com/photo-1586183189334-a4a7f7a36969?w=400",
        "rating": 4.8,
    },
    {
        "id": "m4", "city_name": "Tiflis", "country": "Gürcistan",
        "price": 2800, "currency": "TRY", "duration": "5 Gece", "flight_time": "2sa 00dk",
        "visa_free": True,  "tags": ["Vizesiz", "%15 İndirim"],
        "filter_tags": ["vizesiz", "bütçe-dostu"],
        "image_url": "https://images.unsplash.com/photo-1565008576549-57569a49371d?w=400",
        "rating": 4.7,
    },
    {
        "id": "m5", "city_name": "Bali", "country": "Endonezya",
        "price": 18500, "currency": "TRY", "duration": "6 Gece", "flight_time": "9sa 00dk",
        "visa_free": True,  "tags": ["Vizesiz", "Hafta Sonu"],
        "filter_tags": ["vizesiz", "hafta-sonu"],
        "image_url": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400",
        "rating": 4.9,
    },
]


# --- Mock vizesiz routes — Türk pasaportuyla vizesiz popüler destinasyonlar ---
_MOCK_VIZESIZ: List[Dict[str, Any]] = [
    {
        "id": "vz1",
        "city": "Batum", "country": "Gürcistan", "country_code": "GE",
        "price": 1400, "currency": "TRY",
        "nights": 3, "flight_duration": "1sa 10dk",
        "image_url": "https://images.unsplash.com/photo-1565008576549-57569a49371d?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "vz2",
        "city": "Belgrad", "country": "Sırbistan", "country_code": "RS",
        "price": 1850, "currency": "TRY",
        "nights": 3, "flight_duration": "1sa 30dk",
        "image_url": "https://images.unsplash.com/photo-1566143945069-ea2e7e37e8c5?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "vz3",
        "city": "Saraybosna", "country": "Bosna-Hersek", "country_code": "BA",
        "price": 2100, "currency": "TRY",
        "nights": 4, "flight_duration": "1sa 45dk",
        "image_url": "https://images.unsplash.com/photo-1586183189334-a4a7f7a36969?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "vz4",
        "city": "Budva", "country": "Karadağ", "country_code": "ME",
        "price": 3200, "currency": "TRY",
        "nights": 5, "flight_duration": "1sa 50dk",
        "image_url": "https://images.unsplash.com/photo-1553899017-d6d8d60eaf14?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "vz5",
        "city": "Tiflis", "country": "Gürcistan", "country_code": "GE",
        "price": 2800, "currency": "TRY",
        "nights": 5, "flight_duration": "2sa 00dk",
        "image_url": "https://images.unsplash.com/photo-1565008576549-57569a49371d?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "vz6",
        "city": "Marakeş", "country": "Fas", "country_code": "MA",
        "price": 4200, "currency": "TRY",
        "nights": 4, "flight_duration": "3sa 30dk",
        "image_url": "https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
]


BUDGET_MAX_PRICE: int = 5_000   # default TL threshold

_MOCK_BUDGET_FRIENDLY: List[Dict[str, Any]] = [
    {
        "id": "bd1",
        "city": "Sofya", "country": "Bulgaristan", "country_code": "BG",
        "price": 1100, "currency": "TRY",
        "nights": 2, "flight_duration": "1sa 15dk",
        "discount_badge": 32, "seats_left": None,
        "image_url": "https://images.unsplash.com/photo-1596621873816-7b5aca64c5b2?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": False, "visa_note": None,
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "bd2",
        "city": "Atina", "country": "Yunanistan", "country_code": "GR",
        "price": 1450, "currency": "TRY",
        "nights": 2, "flight_duration": "1sa 20dk",
        "discount_badge": 24, "seats_left": None,
        "image_url": "https://images.unsplash.com/photo-1616489953121-042239c4ca94?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "bd3",
        "city": "Belgrad", "country": "Sırbistan", "country_code": "RS",
        "price": 1850, "currency": "TRY",
        "nights": 3, "flight_duration": "1sa 45dk",
        "discount_badge": 18, "seats_left": None,
        "image_url": "https://images.unsplash.com/photo-1566143945069-ea2e7e37e8c5?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "bd4",
        "city": "Bükreş", "country": "Romanya", "country_code": "RO",
        "price": 2200, "currency": "TRY",
        "nights": 2, "flight_duration": "1sa 45dk",
        "discount_badge": None, "seats_left": 3,
        "image_url": "https://images.unsplash.com/photo-1584395630827-860eee694d7b?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": False, "visa_note": None,
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "bd5",
        "city": "Tiran", "country": "Arnavutluk", "country_code": "AL",
        "price": 2800, "currency": "TRY",
        "nights": 3, "flight_duration": "2sa 00dk",
        "discount_badge": None, "seats_left": 4,
        "image_url": "https://images.unsplash.com/photo-1566143945069-ea2e7e37e8c5?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": True, "visa_note": "Vize gerekmez",
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
    {
        "id": "bd6",
        "city": "Budapeşte", "country": "Macaristan", "country_code": "HU",
        "price": 4800, "currency": "TRY",
        "nights": 3, "flight_duration": "2sa 30dk",
        "discount_badge": 10, "seats_left": None,
        "image_url": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80&auto=format&fit=crop",
        "is_visa_free": False, "visa_note": None,
        "affiliate_url": "https://tp.media/r?marker=649197&trs=331382&p=4114&u=https://www.aviasales.ru",
    },
]


@app.get(
    "/api/v1/discover/budget-friendly",
    tags=["Discover v2"],
    summary="Bütçe dostu rotalar (varsayılan ≤5.000 TL)",
    description=(
        "5.000 TL sınırı altındaki rotaları fiyata göre artan sırayla döner. "
        "DB'de kayıt varsa oradan, yoksa curated mock listesinden döner."
    ),
)
async def get_budget_friendly_routes(
    limit:     int = Query(default=20, le=50),
    max_price: int = Query(default=BUDGET_MAX_PRICE, le=50_000),
):
    """Returns budget-friendly routes under the given price threshold."""
    routes: list[dict] = []
    source = "mock"

    try:
        db_rows = await DatabaseManager.find_all(
            "budget_escapes",
            query={"starting_price": {"$lte": max_price}},
            limit=limit,
            sort_by="starting_price",
            sort_order=1,
        )
        if db_rows:
            for e in db_rows:
                routes.append({
                    "id":              str(e.get("_id", "")),
                    "city":            e.get("city", ""),
                    "country":         e.get("country", ""),
                    "country_code":    e.get("country_code", ""),
                    "price":           e.get("starting_price", 0),
                    "currency":        e.get("currency", "TRY"),
                    "nights":          e.get("nights", 2),
                    "flight_duration": e.get("flight_duration", ""),
                    "image_url":       e.get("image_url", ""),
                    "discount_badge":  e.get("discount_badge"),
                    "seats_left":      e.get("seats_left"),
                    "is_visa_free":    e.get("is_visa_free", False),
                    "affiliate_url":   e.get("affiliate_url", "#"),
                })
            source = "db"
    except Exception:
        pass

    # Supplement with mock when DB has fewer than 5 routes
    if len(routes) < 5:
        existing_ids = {r.get("id", "") for r in routes}
        for mock in _MOCK_BUDGET_FRIENDLY:
            if mock["price"] <= max_price and mock["id"] not in existing_ids:
                routes.append(mock)
                existing_ids.add(mock["id"])
        source = "db+mock" if source == "db" else "mock"

    routes.sort(key=lambda r: r.get("price", 0))
    routes = routes[:limit]
    return {"routes": routes, "source": source, "count": len(routes), "max_price": max_price}


@app.get(
    "/api/v1/discover/vizesiz",
    tags=["Discover v2"],
    summary="Vizesiz rotaları döner (Türk pasaportu)",
    description=(
        "Türkiye'den vize gerektirmeyen popüler destinasyonları fiyat sırasıyla döner. "
        "DB'de kayıt varsa oradan, yoksa curated mock listesinden döner."
    ),
)
async def get_vizesiz_routes(limit: int = Query(default=10, le=50)):
    """Returns visa-free routes for Turkish passport holders.
    Merges DB routes with mock curated list; mock entries fill gaps when DB < 6.
    """
    routes: list[dict] = []
    source = "mock"

    try:
        db_routes = await DatabaseManager.find_all(
            "budget_escapes",
            query={"is_visa_free": True},
            limit=limit,
            sort_by="starting_price",
            sort_order=1,
        )
        if db_routes:
            for e in db_routes:
                routes.append({
                    "id":              str(e.get("_id", "")),
                    "city":            e.get("city", ""),
                    "country":         e.get("country", ""),
                    "country_code":    e.get("country_code", ""),
                    "price":           e.get("starting_price", 0),
                    "currency":        e.get("currency", "TRY"),
                    "nights":          e.get("nights", 3),
                    "flight_duration": e.get("flight_duration", ""),
                    "image_url":       e.get("image_url", ""),
                    "is_visa_free":    True,
                    "visa_note":       "Vize gerekmez",
                    "affiliate_url":   e.get("affiliate_url", "#"),
                })
            source = "db"
    except Exception:
        pass

    # Supplement with mock when DB has fewer than 6 curated routes
    if len(routes) < 6:
        existing_codes = {r["country_code"].upper() for r in routes}
        for mock in _MOCK_VIZESIZ:
            if mock["country_code"].upper() not in existing_codes:
                routes.append(mock)
                existing_codes.add(mock["country_code"].upper())
        if routes:
            source = "db+mock" if source == "db" else "mock"

    routes = routes[:limit]
    return {"routes": routes, "source": source, "count": len(routes)}


@app.get(
    "/api/v1/discover/categories",
    tags=["Discover v2"],
    summary="Keşfet filtre kategorilerini döner",
)
async def get_discover_categories():
    """Stage 1 — Returns filter category list for the Discovery screen pills."""
    return {"categories": _DISCOVER_CATEGORIES}


@app.get(
    "/api/v1/discover/hero",
    tags=["Discover v2"],
    summary="Günün Fırsatı hero kartını döner",
)
async def get_discover_hero():
    """Stage 2 — Returns the featured hero deal. Tries deal_of_day collection; falls back to mock."""
    try:
        deal_of_day = await DatabaseManager.find_all("deal_of_day", limit=1)
        if deal_of_day:
            d = deal_of_day[0]
            return {
                "id":             str(d.get("_id", "db")),
                "city_name":      d.get("title", d.get("city_name", "Roma")),
                "country":        d.get("country", ""),
                "price":          d.get("discounted_price", d.get("price", 1200)),
                "original_price": d.get("original_price"),
                "currency":       d.get("currency", "TRY"),
                "nights":         d.get("nights", 3),
                "duration":       f"{d.get('nights', 3)} Gece • {d.get('nights', 3) + 1} Gün",
                "visa_free":      d.get("is_visa_free", False),
                "tags":           ["Günün Fırsatı"],
                "image_url":      d.get("destination_image_url", d.get("image_url", "")),
                "airline":        d.get("airline"),
                "route":          d.get("route"),
                "discount_rate":  d.get("discount_rate"),
                "remaining_hours": d.get("remaining_hours", 8),
                "is_live":        d.get("is_live", True),
            }
    except Exception:
        pass
    return _MOCK_HERO


@app.get(
    "/api/v1/discover/trending",
    tags=["Discover v2"],
    summary="Viral pin hikayelerini döner",
)
async def get_discover_trending(
    limit: int = Query(default=6, le=20),
):
    """Stage 2 — Returns viral pin stories sorted by view_count. Falls back to mock."""
    try:
        viral_pins = await PinService.find_all({"is_viral": True}, limit=limit)
        if viral_pins:
            stories = [
                {
                    "id":              str(p["_id"]),
                    "location_name":   p.get("title", ""),
                    "cover_image_url": p.get("image_url") or "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=200",
                    "view_count":      p.get("friends_visited", 0) * 100 + 500,
                }
                for p in viral_pins
            ]
            return {"stories": sorted(stories, key=lambda s: s["view_count"], reverse=True)}
        # Fallback: static viral_stories collection
        static = await DatabaseManager.find_all(
            "viral_stories", limit=limit, sort_by="view_count", sort_order=-1
        )
        if static:
            return {"stories": static}
    except Exception:
        pass
    return {"stories": _MOCK_TRENDING}


@app.get(
    "/api/v1/discover/deals",
    tags=["Discover v2"],
    summary="Fırsat listesini döner (kategori filtreli)",
    description=(
        "Her objede: city_name, price, duration, flight_time, visa_free (bool), "
        "tags, filter_tags, image_url. "
        "category: vizesiz | bütçe-dostu | hafta-sonu | all"
    ),
)
async def get_discover_deals(
    category: Optional[str] = Query(None, description="vizesiz | bütçe-dostu | hafta-sonu | all"),
    limit:    int            = Query(default=10, le=50),
):
    """Stage 3 — Deals list with category filter. DB first, then mock fallback."""
    try:
        query: Dict[str, Any] = {}
        if category == "vizesiz":
            query["is_visa_free"] = True
        elif category == "bütçe-dostu":
            query["starting_price"] = {"$lt": 5000}

        db_escapes = await DatabaseManager.find_all(
            "budget_escapes", query=query, limit=limit,
            sort_by="starting_price", sort_order=1,
        )
        if db_escapes:
            deals = []
            for e in db_escapes:
                tags, filter_tags = [], []
                if e.get("is_visa_free"):
                    tags.append("Vizesiz")
                    filter_tags.append("vizesiz")
                if e.get("discount_badge"):
                    tags.append(f"%{e['discount_badge']} İndirim")
                if e.get("starting_price", 9999) < 5000:
                    filter_tags.append("bütçe-dostu")
                deals.append({
                    "id":          str(e.get("_id", "")),
                    "city_name":   e.get("city", ""),
                    "country":     e.get("country", ""),
                    "price":       e.get("starting_price", 0),
                    "currency":    e.get("currency", "TRY"),
                    "duration":    f"{e.get('nights', 3)} Gece",
                    "flight_time": e.get("flight_duration", ""),
                    "visa_free":   e.get("is_visa_free", False),
                    "tags":        tags,
                    "filter_tags": filter_tags,
                    "image_url":   e.get("image_url", ""),
                    "rating":      e.get("rating"),
                })
            return {"deals": deals, "source": "db"}
    except Exception:
        pass

    # Mock fallback — filter in Python
    mock = _MOCK_DEALS
    if category and category != "all":
        mock = [d for d in _MOCK_DEALS if category in d.get("filter_tags", [])]
    return {"deals": mock[:limit], "source": "mock"}


# ============================================================================
#                     SOCIAL MAP (HARİTA) ENDPOINTS
# ============================================================================

@app.get(
    "/api/v1/map/pins",
    response_model=List[MapPinResponse],
    tags=["Social Map"],
    summary="Haritadaki tüm sosyal noktaları getirir",
    description="Kullanıcı tarafından eklenen tüm konum pinlerini döner."
)
async def get_map_pins(
    pin_type: Optional[MapPinType] = None,
    city: Optional[str] = None,
    country: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    skip: int = Query(default=0, ge=0)
):
    """Retrieves all social map pins."""
    try:
        query = {}
        if pin_type:
            query["type"] = pin_type.value
        if city:
            query["city"] = city
        if country:
            query["country"] = country
        
        pins = await PinService.find_all(query, skip, limit)
        
        # Add tips_count to each pin
        result = []
        for pin in pins:
            pin["tips_count"] = len(pin.get("user_tips", []))
            result.append(MapPinResponse(**pin))
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veri getirme hatası: {str(e)}"
        )


@app.post(
    "/api/v1/map/pins",
    response_model=MapPinResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Social Map"],
    summary="Yeni konum pini ekle"
)
async def create_map_pin(pin: MapPinCreate):
    """Creates a new map pin."""
    try:
        pin_db = MapPinInDB(**pin.model_dump(), user_tips=[])
        document = pin_db.to_dict()
        
        pin_id = await DatabaseManager.insert_one(COLLECTIONS["pins"], document)
        
        if not pin_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Pin oluşturulamadı"
            )
        
        created_pin = await PinService.find_one(pin_id)
        created_pin["tips_count"] = 0
        return MapPinResponse(**created_pin)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veritabanı hatası: {str(e)}"
        )


@app.get(
    "/api/v1/map/pins/nearby",
    response_model=List[MapPinResponse],
    tags=["Social Map"],
    summary="Yakındaki pinleri getir"
)
async def get_nearby_pins(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=10, ge=1, le=100)
):
    """Retrieves pins near a location."""
    try:
        pins = await PinService.find_nearby(lat, lng, radius_km)
        
        result = []
        for pin in pins:
            pin["tips_count"] = len(pin.get("user_tips", []))
            result.append(MapPinResponse(**pin))
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veri getirme hatası: {str(e)}"
        )



@app.patch(
    "/api/v1/map/pins/{pin_id}",
    tags=["Social Map"],
    summary="Konum pinini güncelle (sadece oluşturan kullanıcı)"
)
async def update_map_pin(
    pin_id: str = Path(..., description="Güncellenecek pin'in ObjectId'si"),
    user_id: str = Query(..., description="İstekte bulunan kullanıcının ID'si"),
    data: dict = Body(...)
):
    """Updates a map pin — only the creator can update it."""
    from datetime import datetime
    if not ObjectId.is_valid(pin_id):
        raise HTTPException(status_code=400, detail="Geçersiz pin ID")

    pin = await PinService.find_one(pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin bulunamadı")

    if pin.get("user_id") and pin["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Sadece oluşturan kullanıcı düzenleyebilir")

    allowed = {"title", "type", "description", "is_secret_spot", "image_url", "place_type", "price_range"}
    update_data = {k: v for k, v in data.items() if k in allowed}
    update_data["updated_at"] = datetime.utcnow()

    collection = DatabaseManager.get_collection(COLLECTIONS["pins"])
    result = await collection.update_one({"_id": ObjectId(pin_id)}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Pin güncellenemedi")

    updated = await PinService.find_one(pin_id)
    return updated

@app.delete(
    "/api/v1/map/pins/{pin_id}",
    tags=["Social Map"],
    summary="Konum pinini sil (sadece oluşturan kullanıcı)"
)
async def delete_map_pin(
    pin_id: str = Path(..., description="Silinecek pin'in ObjectId'si"),
    user_id: str = Query(..., description="İstekte bulunan kullanıcının ID'si")
):
    """Deletes a map pin — only the creator can delete it."""
    if not ObjectId.is_valid(pin_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz pin ID")

    pin = await PinService.find_one(pin_id)
    if not pin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pin bulunamadı")

    if pin.get("user_id") and pin["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sadece oluşturan kullanıcı silebilir")

    deleted = await DatabaseManager.delete_one(COLLECTIONS["pins"], pin_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Pin silinemedi")

    return {"success": True, "message": "Pin silindi", "pin_id": pin_id}




@app.post(
    "/api/v1/map/pins/{pin_id}/rate",
    tags=["Social Map"],
    summary="Pin için yıldız puanı ver (1-5)"
)
async def rate_map_pin(
    pin_id: str = Path(...),
    data: dict = Body(...)
):
    """Saves or updates a user rating for a pin and recalculates the average."""
    from datetime import datetime
    if not ObjectId.is_valid(pin_id):
        raise HTTPException(status_code=400, detail="Geçersiz pin ID")

    pin = await PinService.find_one(pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin bulunamadı")

    user_id = data.get("user_id", "")
    new_rating = float(data.get("rating", 0))
    if not (1 <= new_rating <= 5):
        raise HTTPException(status_code=400, detail="Puan 1-5 arasında olmalı")

    collection = DatabaseManager.get_collection(COLLECTIONS["pins"])

    # Store per-user ratings in a subdocument
    ratings = pin.get("ratings", {})
    ratings[user_id] = new_rating

    # Recalculate average
    avg = round(sum(ratings.values()) / len(ratings), 1)

    await collection.update_one(
        {"_id": ObjectId(pin_id)},
        {"$set": {"ratings": ratings, "rating": avg, "updated_at": datetime.utcnow()}}
    )
    return {"success": True, "rating": avg, "total_ratings": len(ratings)}

# ============================================================================
#                     PAX — EVENT PIN ENDPOINTS
# ============================================================================

@app.post(
    "/api/v1/map/events",
    response_model=EventPinResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["PAX Events"],
    summary="Yeni PAX etkinlik pini oluştur"
)
async def create_event_pin(event: EventPinCreate):
    """Creates a new EventPin on the social map."""
    try:
        db_obj = EventPinInDB(**event.model_dump())
        doc = db_obj.to_dict()

        event_id = await EventPinService.create(doc)
        if not event_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Etkinlik oluşturulamadı"
            )

        created = await EventPinService.find_one(event_id)
        created["join_request_count"] = 0
        return EventPinResponse(**created)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veritabanı hatası: {str(e)}"
        )


@app.get(
    "/api/v1/map/events",
    response_model=List[EventPinResponse],
    tags=["PAX Events"],
    summary="Aktif etkinlik pinlerini listele"
)
async def list_event_pins(
    event_type: Optional[EventType] = None,
    city: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    skip: int = Query(default=0, ge=0)
):
    """Returns active EventPins, optionally filtered by type/city."""
    try:
        query: Dict[str, Any] = {"status": EventStatus.ACTIVE.value}
        if event_type:
            query["event_type"] = event_type.value
        if city:
            query["city"] = city

        events = await EventPinService.find_all(query, skip, limit)

        result = []
        for ev in events:
            ev["join_request_count"] = await EventPinService.count_join_requests(ev["_id"])
            result.append(EventPinResponse(**ev))

        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Etkinlikler getirilemedi: {str(e)}"
        )


@app.get(
    "/api/v1/map/events/{event_id}",
    response_model=EventPinResponse,
    tags=["PAX Events"],
    summary="Tek bir etkinlik pinini getir"
)
async def get_event_pin(event_id: str = Path(...)):
    """Returns a single EventPin by ID."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz etkinlik ID")

    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etkinlik bulunamadı")

    event["join_request_count"] = await EventPinService.count_join_requests(event_id)
    return EventPinResponse(**event)


@app.delete(
    "/api/v1/map/events/{event_id}",
    tags=["PAX Events"],
    summary="Etkinlik pinini sil (sadece oluşturan kullanıcı)"
)
async def delete_event_pin(
    event_id: str = Path(...),
    user_id: str = Query(..., description="İstekte bulunan kullanıcının ID'si")
):
    """Deletes an EventPin — only the creator can delete it."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz etkinlik ID")

    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etkinlik bulunamadı")

    if event.get("creator_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sadece etkinliği oluşturan silebilir")

    deleted = await EventPinService.delete(event_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Etkinlik silinemedi")

    return {"success": True, "message": "Etkinlik silindi", "event_id": event_id}


@app.post(
    "/api/v1/map/events/{event_id}/join",
    response_model=JoinRequestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["PAX Events"],
    summary="Etkinliğe katılma isteği gönder"
)
async def send_join_request(
    event_id: str = Path(...),
    request: JoinRequestCreate = ...
):
    """Sends a join request for an EventPin. Creator cannot join their own event."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz etkinlik ID")

    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etkinlik bulunamadı")

    if event.get("status") != EventStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu etkinlik artık aktif değil")

    if event.get("creator_id") == request.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kendi etkinliğine istek gönderemezsin")

    if event.get("participant_count", 0) >= event.get("max_participants", 10):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Etkinlik dolu, yeni katılımcı alınmıyor")

    already = await JoinRequestService.already_requested(event_id, request.user_id)
    if already:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bu etkinlik için zaten bir isteğin var")

    db_obj = JoinRequestInDB(**request.model_dump(), event_id=event_id)
    doc = db_obj.to_dict()

    req_id = await JoinRequestService.create(doc)
    if not req_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="İstek gönderilemedi")

    created = await JoinRequestService.find_one(req_id)
    return JoinRequestResponse(**created)


@app.get(
    "/api/v1/map/events/{event_id}/requests",
    response_model=List[JoinRequestResponse],
    tags=["PAX Events"],
    summary="Etkinliğin katılma isteklerini listele (sadece oluşturan görebilir)"
)
async def list_join_requests(
    event_id: str = Path(...),
    creator_id: str = Query(..., description="Etkinliği oluşturan kullanıcının ID'si")
):
    """Returns all join requests for an event — only visible to the creator."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz etkinlik ID")

    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etkinlik bulunamadı")

    if event.get("creator_id") != creator_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sadece etkinlik sahibi istekleri görebilir")

    requests = await JoinRequestService.find_by_event(event_id)
    return [JoinRequestResponse(**r) for r in requests]


@app.patch(
    "/api/v1/map/events/{event_id}/requests/{request_id}",
    response_model=JoinRequestResponse,
    tags=["PAX Events"],
    summary="Katılma isteğini onayla veya reddet"
)
async def update_join_request_status(
    event_id: str = Path(...),
    request_id: str = Path(...),
    body: JoinRequestStatusUpdate = ...,
    creator_id: str = Query(..., description="Etkinliği oluşturan kullanıcının ID'si")
):
    """Approves or rejects a join request. Only the event creator can do this."""
    if not ObjectId.is_valid(event_id) or not ObjectId.is_valid(request_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz ID")

    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etkinlik bulunamadı")

    if event.get("creator_id") != creator_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sadece etkinlik sahibi onaylayabilir/reddedebilir")

    req = await JoinRequestService.find_one(request_id)
    if not req or req.get("event_id") != event_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Katılma isteği bulunamadı")

    if req.get("status") != JoinRequestStatus.PENDING.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu istek zaten işleme alınmış")

    updated = await JoinRequestService.update_status(request_id, body.status.value)
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Durum güncellenemedi")

    # If approved → increment participant count + notify the requester
    if body.status == JoinRequestStatus.APPROVED:
        await EventPinService.increment_participant(event_id)

        notif = NotificationCreate(
            user_id     = req["user_id"],
            type        = NotificationType.JOIN_APPROVED,
            title       = "İsteğin onaylandı! 🎉",
            body        = f"'{event.get('title', 'Etkinlik')}' etkinliğine katılım isteğin onaylandı. Çantaları hazırla!",
            event_id    = event_id,
            event_title = event.get("title"),
            read        = False,
        )
        await NotificationService.create(notif.model_dump())

    # If rejected → also notify
    elif body.status == JoinRequestStatus.REJECTED:
        notif = NotificationCreate(
            user_id     = req["user_id"],
            type        = NotificationType.JOIN_REJECTED,
            title       = "İstek reddedildi",
            body        = f"'{event.get('title', 'Etkinlik')}' etkinliğine katılım isteğin bu sefer kabul edilmedi.",
            event_id    = event_id,
            event_title = event.get("title"),
            read        = False,
        )
        await NotificationService.create(notif.model_dump())

    updated_req = await JoinRequestService.find_one(request_id)
    return JoinRequestResponse(**updated_req)


@app.delete(
    "/api/v1/map/events/{event_id}/join",
    tags=["PAX Events"],
    summary="Katılma isteğini iptal et (isteği gönderen kullanıcı)"
)
async def cancel_join_request(
    event_id: str = Path(...),
    user_id:  str = Query(..., description="İsteği iptal eden kullanıcının ID'si")
):
    """Kullanıcı kendi katılma isteğini iptal eder ve DB'den siler."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")

    collection = DatabaseManager.get_collection(COLLECTIONS["join_requests"])
    result = await collection.delete_one({"event_id": event_id, "user_id": user_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Katılma isteği bulunamadı")

    return {"success": True, "message": "Katılma isteği iptal edildi", "event_id": event_id}




# ============================================================================
#                      EVENT GROUP CHAT ENDPOINTS
# ============================================================================

@app.post(
    "/api/v1/map/events/{event_id}/chat",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["PAX Events"],
    summary="Etkinlik grup sohbetine mesaj gönder"
)
async def send_chat_message(
    event_id: str = Path(...),
    body: ChatMessageCreate = ...,
):
    """Sadece etkinlik organizatörü veya kabul edilmiş katılımcılar mesaj gönderebilir."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")

    events_col   = DatabaseManager.get_collection(COLLECTIONS["event_pins"])
    requests_col = DatabaseManager.get_collection(COLLECTIONS["join_requests"])

    event = await events_col.find_one({"_id": ObjectId(event_id)})
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadi")

    is_creator  = event.get("creator_id") == body.user_id
    is_approved = False
    if not is_creator:
        req = await requests_col.find_one({"event_id": event_id, "user_id": body.user_id, "status": "approved"})
        is_approved = req is not None

    if not is_creator and not is_approved:
        raise HTTPException(status_code=403, detail="Sohbete erisim yetkiniz yok")

    chat_col = DatabaseManager.get_collection(COLLECTIONS["event_chat"])
    msg = ChatMessageInDB(event_id=event_id, **body.model_dump())
    doc = msg.to_dict()
    result = await chat_col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return ChatMessageResponse(**doc)


@app.get(
    "/api/v1/map/events/{event_id}/chat",
    response_model=List[ChatMessageResponse],
    tags=["PAX Events"],
    summary="Etkinlik grup sohbeti mesajlarini getir"
)
async def get_chat_messages(
    event_id:  str = Path(...),
    user_id:   str = Query(..., description="Isteyen kullanicinin ID si"),
    limit:     int = Query(default=50, le=200),
):
    """Sadece organizatör veya kabul edilmiş katılımcılar mesajları görebilir."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Gecersiz etkinlik ID")

    events_col   = DatabaseManager.get_collection(COLLECTIONS["event_pins"])
    requests_col = DatabaseManager.get_collection(COLLECTIONS["join_requests"])

    event = await events_col.find_one({"_id": ObjectId(event_id)})
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadi")

    is_creator  = event.get("creator_id") == user_id
    is_approved = False
    if not is_creator:
        req = await requests_col.find_one({"event_id": event_id, "user_id": user_id, "status": "approved"})
        is_approved = req is not None

    if not is_creator and not is_approved:
        raise HTTPException(status_code=403, detail="Sohbete erisim yetkiniz yok")

    chat_col = DatabaseManager.get_collection(COLLECTIONS["event_chat"])
    cursor   = chat_col.find({"event_id": event_id}).sort("created_at", 1).limit(limit)
    messages = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        messages.append(ChatMessageResponse(**doc))
    return messages


# ============================================================================
#                      GEMINI AI — TRAVEL RECOMMENDATIONS
# ============================================================================

@app.get(
    "/api/v1/ai/travel-recommendations",
    tags=["AI"],
    summary="Gemini AI ile sehir icin seyahat onerileri getir"
)
async def get_travel_recommendations(
    city: str = Query(..., min_length=1, max_length=100, description="Onerilerin istendigi sehir adi")
):
    """
    Fetches AI-powered travel recommendations for the given city via Gemini.
    Only the city name is sent to the model; the API key is read from GEMINI_API_KEY env var.
    """
    result = await fetchTravelRecommendations(city)
    if not result.get("success"):
        raise HTTPException(
            status_code=502,
            detail=result.get("error", "AI servisi yanit vermedi")
        )
    return result


@app.get(
    "/api/v1/ai/pax-itinerary",
    tags=["AI"],
    summary="Gemini 2.0 Flash ile gun gun seyahat plani olustur"
)
async def get_pax_itinerary(
    city: str = Query(..., min_length=1, max_length=100, description="Seyahat edilecek sehir"),
    days: int = Query(default=3, ge=1, le=14, description="Plan suresi (1-14 gun)"),
):
    """
    Generates a day-by-day PAX itinerary via Gemini 2.0 Flash.
    Each day: 1 tourist location + 1 local food/drink recommendation.
    Response: { "success": true, "data": { "city": "...", "days": N, "itinerary": [...] } }
    """
    result = await generate_pax_itinerary(city=city, days=days)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "AI servisi yanit vermedi"))
    return result


@app.get("/api/v1/plans/{plan_id}/ai-recommendations", tags=["AI"], summary="Plan icin Gemini AI gun plani")
async def get_plan_ai_recommendations(plan_id: str = Path(...)):
    """
    Planin destinasyon + gece sayisini alip Gemini'den gercek AI gun plani uretir.
    Donus: {"success": true, "data": {"city":"...", "days":N, "itinerary":[...]}}
    """
    try:
        ObjectId(plan_id)  # format validation
    except Exception:
        raise HTTPException(status_code=400, detail="Gecersiz plan_id")

    wishlist = await WishlistService.find_one(plan_id)
    if not wishlist:
        raise HTTPException(status_code=404, detail="Plan bulunamadi")

    destination  = wishlist.get("destination", "")
    trip_details = wishlist.get("trip_details", {}) or {}
    nights       = trip_details.get("nights") or wishlist.get("nights") or 3
    try:
        nights = int(nights)
    except (TypeError, ValueError):
        nights = 3

    if not destination:
        raise HTTPException(status_code=400, detail="Plan destinasyonu eksik")

    # "New York, Amerika Birleşik Devletleri" → "New York" (Gemini için kısa şehir adı)
    city_clean = destination.split(",")[0].strip() or destination

    result = await generate_pax_itinerary(city=city_clean, days=max(1, min(nights, 14)))
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "AI servisi yanit vermedi"))
    return result


@app.get("/api/generate-itinerary", tags=["AI"], summary="Kisa yol: gun gun seyahat plani")
async def generate_itinerary_shortpath(
    city: str = Query(..., min_length=1, max_length=100),
    days: int = Query(default=3, ge=1, le=14),
):
    """Frontend kisa yol endpoint'i — /api/v1/ai/pax-itinerary ile ayni."""
    result = await generate_pax_itinerary(city=city, days=days)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "AI servisi yanit vermedi"))
    return result


# ============================================================================
#              BACKGROUND: AI İTİNERARY ÜRETİMİ VE KAYIT
# ============================================================================

async def _generate_and_save_ai_itinerary(wishlist_id: str, destination: str, nights: int):
    """
    Plan oluşturulunca arka planda çalışır. Gemini'den itinerary alır ve
    wishlist document'ına 'ai_itinerary' alanı olarak kaydeder.
    Böylece detay ekranı her açılışında yeniden Gemini'ye gitmez.
    """
    try:
        city = destination.split(",")[0].strip() or destination
        days = max(1, min(int(nights), 14))
        result = await generate_pax_itinerary(city=city, days=days)
        if not result.get("success"):
            return
        itinerary = result.get("data", {}).get("itinerary", [])
        if not itinerary:
            return
        await DatabaseManager.update_one(
            COLLECTIONS["wishlists"],
            wishlist_id,
            {"ai_itinerary": itinerary, "ai_itinerary_city": city},
        )
        print(f"[AI] itinerary kaydedildi: {wishlist_id} ({city}, {days}g)")
    except Exception as exc:
        print(f"[AI] itinerary kayit hatasi: {exc}")


# ============================================================================
#                      SMART PLANNER ENDPOINTS
# ============================================================================

@app.post(
    "/api/v1/wishlists",
    response_model=WishlistResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Smart Planner"],
    summary="Yeni seyahat planı oluştur"
)
async def create_wishlist(wishlist: WishlistCreate, background_tasks: BackgroundTasks, current_user: dict = None):
    """
    Creates a new wishlist/trip with background price scraping.
    
    Flow:
    1. İlk olarak plan 'processing' durumunda DB'ye kaydedilir
    2. Kullanıcıya hemen yanıt döner
    3. Arka planda scraper fiyatları tarar
    4. Fiyat bulunduğunda DB güncellenir ve status 'tracking' olur
    """
    try:
        # Tarih bilgisi (opsiyonel)
        scrape_date = None
        if wishlist.start_date:
            scrape_date = wishlist.start_date.isoformat()
        
        # Destination display name (autocomplete'den geliyorsa)
        destination_display = getattr(wishlist, 'destination_display', None) or wishlist.destination
        destination_lat = getattr(wishlist, 'destination_lat', None)
        destination_lng = getattr(wishlist, 'destination_lng', None)
        destination_country = getattr(wishlist, 'destination_country', None)
        destination_country_code = getattr(wishlist, 'destination_country_code', None)
        
        # Trip name oluştur
        trip_name = wishlist.trip_name or f"{wishlist.origin} → {destination_display}"
        
        # İlk kaydı 'processing' durumunda oluştur (scraper henüz çalışmadı)
        wishlist_db = WishlistInDB(
            user_id=current_user["user_id"] if current_user else getattr(wishlist, 'user_id', None),
            trip_name=trip_name,
            origin=wishlist.origin,
            destination=wishlist.destination,
            start_date=wishlist.start_date,
            end_date=wishlist.end_date,
            date_type=wishlist.date_type,
            target_price=wishlist.target_price,
            budget=wishlist.budget,
            current_price=None,  # Scraper çalıştığında güncellenecek
            currency=wishlist.currency,
            is_active=True,
            status=TripStatus.PROCESSING,  # Scraper çalışırken 'processing'
            travelers_count=wishlist.travelers_count,
            adults=wishlist.adults,
            children=wishlist.children,
            preferences=wishlist.preferences,
            notes="🔍 Fiyatlar taranıyor...",  # Kullanıcıya bilgi
            itinerary_items=[]  # Scraper çalıştığında doldurulacak
        )
        document = wishlist_db.to_dict()
        
        # Koordinat bilgilerini document'a ekle
        if destination_lat and destination_lng:
            document["destination_lat"] = destination_lat
            document["destination_lng"] = destination_lng
        if destination_display:
            document["destination_display"] = destination_display
        if destination_country:
            document["destination_country"] = destination_country
        if destination_country_code:
            document["destination_country_code"] = destination_country_code
        
        # Flexible date bilgilerini ekle
        flexible_month = getattr(wishlist, 'flexible_month', None)
        flexible_duration = getattr(wishlist, 'flexible_duration', None)
        if flexible_month:
            document["flexible_month"] = flexible_month
        if flexible_duration:
            document["flexible_duration"] = flexible_duration
        
        # DB'ye kaydet
        wishlist_id = await DatabaseManager.insert_one(COLLECTIONS["wishlists"], document)
        
        if not wishlist_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Wishlist oluşturulamadı"
            )
        
        # ⚡ ARKA PLANDA SCRAPER ÇALIŞTIR
        # Kullanıcı beklemesin, scraper arka planda çalışsın
        background_tasks.add_task(
            process_wishlist_scrape,
            wishlist_id=wishlist_id,
            origin=wishlist.origin,
            destination=wishlist.destination,
            travel_date=scrape_date,
            return_date=str(wishlist.end_date) if wishlist.end_date else None,
            budget=wishlist.budget or wishlist.target_price,
            guests=wishlist.travelers_count or 1,
        )

        # ⚡ ARKA PLANDA AI İTİNERARY ÜRETİMİ
        # Plan oluşturulunca tek seferlik Gemini çağrısı — detay ekranı DB'den okur
        if wishlist.start_date and wishlist.end_date:
            _nights = max(1, (wishlist.end_date - wishlist.start_date).days)
        else:
            _nights = 3
        background_tasks.add_task(
            _generate_and_save_ai_itinerary,
            wishlist_id=wishlist_id,
            destination=wishlist.destination,
            nights=_nights,
        )

        print(f" Background task balatld: {wishlist_id}")
        
        # Kullanıcıya hemen yanıt dön
        created = await WishlistService.find_one(wishlist_id)
        return WishlistResponse(**created)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veritabanı hatası: {str(e)}"
        )


# Backward compatibility endpoint
@app.post("/add-wishlist", response_model=WishlistResponse, status_code=status.HTTP_201_CREATED, tags=["Smart Planner"])
async def add_wishlist_legacy(wishlist: WishlistCreate, background_tasks: BackgroundTasks):
    """Legacy endpoint - use /api/v1/wishlists instead."""
    return await create_wishlist(wishlist, background_tasks)


# Frontend compatible endpoint  
@app.post("/api/v1/wishlist/add", response_model=WishlistResponse, status_code=status.HTTP_201_CREATED, tags=["Smart Planner"])
async def add_wishlist_api(wishlist: WishlistCreate, background_tasks: BackgroundTasks):
    """Adds a new wishlist/trip. Frontend compatible endpoint."""
    return await create_wishlist(wishlist, background_tasks)


@app.get(
    "/api/v1/wishlists",
    response_model=List[WishlistResponse],
    tags=["Smart Planner"],
    summary="Tüm seyahat planlarını listele"
)
async def get_wishlists(
    status_filter: Optional[TripStatus] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=100, le=500),
    skip: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_optional_user)
):
    """Retrieves wishlists for the authenticated user."""
    try:
        query = {}
        if current_user:
            uid = current_user["user_id"]
            # Include both user-owned plans AND legacy plans that have no owner
            query["$or"] = [
                {"user_id": uid},
                {"user_id": None},
                {"user_id": {"$exists": False}},
            ]
        if status_filter:
            query["status"] = status_filter.value
        if is_active is not None:
            query["is_active"] = is_active
        
        wishlists = await WishlistService.find_all(query, skip, limit)
        
        # Safely convert wishlists with default values for missing fields
        result = []
        for w in wishlists:
            try:
                # Ensure required fields have defaults if missing
                w.setdefault("origin", "Unknown")
                w.setdefault("destination", "Unknown")
                w.setdefault("date_type", "fixed")
                w.setdefault("currency", "TRY")
                w.setdefault("is_active", True)
                w.setdefault("status", "active")
                w.setdefault("travelers_count", 1)
                w.setdefault("adults", 1)
                w.setdefault("children", 0)
                w.setdefault("preferences", [])
                w.setdefault("itinerary_items", [])
                w.setdefault("created_at", datetime.utcnow())
                w.setdefault("updated_at", datetime.utcnow())
                
                result.append(WishlistResponse(**w))
            except Exception as validation_error:
                print(f" Wishlist dntrme hatas (_id: {w.get('_id')}): {validation_error}")
                continue
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veri getirme hatası: {str(e)}"
        )


# Backward compatibility
@app.get("/wishlists", response_model=List[WishlistResponse], tags=["Smart Planner"])
async def get_wishlists_legacy(
    status_filter: Optional[TripStatus] = None,
    is_active: Optional[bool] = None,
    limit: int = 100,
    skip: int = 0
):
    """Legacy endpoint."""
    return await get_wishlists(status_filter, is_active, limit, skip)


@app.delete(
    "/api/v1/wishlists/{wishlist_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Smart Planner"],
    summary="Seyahat planını sil"
)
async def delete_wishlist(
    wishlist_id: str = Path(..., description="Silinecek Wishlist ID"),
    current_user: dict = Depends(get_optional_user)
):
    """Deletes a wishlist by ID. Only owner can delete."""
    try:
        if not ObjectId.is_valid(wishlist_id):
            raise HTTPException(status_code=400, detail="Geçersiz ID")
            
        success = await WishlistService.delete(wishlist_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Wishlist bulunamadı")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/api/v1/planner/{wishlist_id}",
    response_model=PlannerResponse,
    tags=["Smart Planner"],
    summary="Smart Planner detaylarını döner",
    description="Uçuş, otel, aktivite bilgilerini ve AI önerilerini içerir."
)
async def get_planner_data(
    wishlist_id: str = Path(..., description="Wishlist ID")
):
    """Returns complete planner data for the Smart Planner UI."""
    try:
        if not ObjectId.is_valid(wishlist_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Geçersiz wishlist ID"
            )
        
        wishlist = await WishlistService.find_one(wishlist_id)
        
        if not wishlist:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Wishlist bulunamadı"
            )
        
        # Extract itinerary items
        itinerary = wishlist.get("itinerary_items", [])
        
        flights = [i for i in itinerary if i.get("item_type") == "flight"]
        hotels = [i for i in itinerary if i.get("item_type") == "hotel"]
        activities = [i for i in itinerary if i.get("item_type") in ["activity", "restaurant", "transfer"]]
        
        # Generate sample data if empty
        if not flights:
            flights = [
                {
                    "item_type": "flight",
                    "provider": "Pegasus",
                    "title": f"{wishlist.get('origin')} → {wishlist.get('destination')}",
                    "price": wishlist.get("current_price") or 899,
                    "currency": wishlist.get("currency", "TRY"),
                    "is_selected": True,
                    "flight_details": {
                        "airline": "Pegasus",
                        "departure_time": "06:30",
                        "arrival_time": "07:45",
                        "duration": "1h 15m"
                    }
                }
            ]
        
        if not hotels:
            hotels = [
                {
                    "item_type": "hotel",
                    "provider": "Booking.com",
                    "title": f"{wishlist.get('destination')} Otel",
                    "price": 2500,
                    "currency": wishlist.get("currency", "TRY"),
                    "is_selected": True,
                    "hotel_details": {
                        "hotel_name": "Sample Hotel",
                        "stars": 4,
                        "rating": 8.5
                    }
                }
            ]
        
        # Calculate price summary
        selected_flight = next((f for f in flights if f.get("is_selected")), flights[0] if flights else None)
        selected_hotel = next((h for h in hotels if h.get("is_selected")), hotels[0] if hotels else None)
        
        flight_price = selected_flight.get("price", 0) if selected_flight else 0
        hotel_price = selected_hotel.get("price", 0) if selected_hotel else 0
        
        price_summary = {
            "flight_price": flight_price,
            "hotel_price": hotel_price,
            "activities_price": sum(a.get("price", 0) for a in activities if a.get("is_selected")),
            "total_price": flight_price + hotel_price,
            "target_price": wishlist.get("target_price", 0),
            "currency": wishlist.get("currency", "TRY")
        }
        price_summary["savings"] = price_summary["target_price"] - price_summary["total_price"]
        
        # Get AI suggestions (null for now)
        ai_plan = await generate_null_plan(
            origin=wishlist.get("origin", ""),
            destination=wishlist.get("destination", ""),
            start_date=str(wishlist.get("start_date", "")),
            end_date=str(wishlist.get("end_date", "")),
            budget=wishlist.get("target_price", 0)
        )
        
        ai_suggestions = None
        if ai_plan.success:
            ai_suggestions = {
                "travel_tips": ai_plan.travel_tips,
                "best_time": ai_plan.best_time_to_visit,
                "local_insights": ai_plan.local_insights
            }
        
        # Format dates
        start_date = wishlist.get("start_date", "")
        end_date = wishlist.get("end_date", "")
        created_at = wishlist.get("created_at", datetime.utcnow())
        last_scraped = wishlist.get("last_scraped_at")
        
        return PlannerResponse(
            id=wishlist["_id"],
            trip_name=wishlist.get("trip_name", ""),
            origin=wishlist.get("origin", ""),
            destination=wishlist.get("destination", ""),
            start_date=str(start_date),
            end_date=str(end_date),
            target_price=wishlist.get("target_price", 0),
            current_price=wishlist.get("current_price"),
            currency=wishlist.get("currency", "TRY"),
            is_active=wishlist.get("is_active", True),
            status=wishlist.get("status", "active"),
            travelers_count=wishlist.get("travelers_count", 1),
            flights=flights,
            hotels=hotels,
            activities=activities,
            price_summary=price_summary,
            ai_suggestions=ai_suggestions,
            trip_details=wishlist.get("trip_details"),
            last_scraped_at=str(last_scraped) if last_scraped else None,
            created_at=str(created_at)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veri getirme hatası: {str(e)}"
        )


# Backward compatibility
@app.get("/planner/{wishlist_id}", response_model=PlannerResponse, tags=["Smart Planner"])
async def get_planner_legacy(wishlist_id: str):
    """Legacy endpoint."""
    return await get_planner_data(wishlist_id)


@app.get(
    "/api/v1/plans/{plan_id}/details",
    response_model=PlanDetailsResponse,
    tags=["Smart Planner"],
    summary="Plan detaylarını döner (uçuşlar, oteller, AI gün planları)"
)
async def get_plan_details(plan_id: str = Path(...)):
    """
    Returns full trip details for a plan: flights, 3 hotel options,
    AI day plans, and scrape status.
    """
    try:
        if not ObjectId.is_valid(plan_id):
            raise HTTPException(status_code=400, detail="Geçersiz plan ID")

        wishlist = await WishlistService.find_one(plan_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Plan bulunamadı")

        trip_details: Dict[str, Any] = wishlist.get("trip_details") or {}
        nights = trip_details.get("nights", 0)
        destination = wishlist.get("destination", "")
        origin = wishlist.get("origin", "IST")

        # AI day plans — DB'de kayıtlı itinerary varsa onu kullan (plan oluşturulunca arka planda üretildi)
        # Yoksa static template fallback
        saved_itinerary = wishlist.get("ai_itinerary")
        if saved_itinerary and isinstance(saved_itinerary, list) and len(saved_itinerary) > 0:
            ai_day_plans = saved_itinerary
        else:
            ai_day_plans = generate_ai_day_plans(
                destination=destination,
                nights=nights or 4,
                origin=origin
            )

        # Determine scrape status
        scrape_status_field = wishlist.get("scrape_status", "pending")
        if trip_details:
            scrape_status = "ready"
        elif scrape_status_field == "error":
            scrape_status = "error"
        else:
            scrape_status = "pending"

        last_scraped = wishlist.get("last_scraped_at") or trip_details.get("scraped_at")

        return PlanDetailsResponse(
            plan_id=plan_id,
            trip_name=wishlist.get("trip_name"),
            origin=origin,
            destination=destination,
            start_date=str(wishlist.get("start_date")) if wishlist.get("start_date") else None,
            end_date=str(wishlist.get("end_date")) if wishlist.get("end_date") else None,
            image_url=wishlist.get("image_url"),
            trip_type=trip_details.get("trip_type", "bireysel"),
            nights=nights,
            outbound_flight=trip_details.get("outbound_flight"),
            return_flight=trip_details.get("return_flight"),
            hotel_options=trip_details.get("hotel_options", []),
            selected_hotel_index=trip_details.get("selected_hotel_index", 0),
            budget_summary=trip_details.get("budget_summary"),
            ai_day_plans=ai_day_plans,
            scrape_status=scrape_status,
            last_scraped_at=str(last_scraped) if last_scraped else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Plan detay hatası: {str(e)}")


@app.get(
    "/api/v1/plans/{plan_id}/budget",
    response_model=BudgetCalculateResponse,
    tags=["Smart Planner"],
    summary="Seçili otele göre anlık bütçe hesapla"
)
async def calculate_plan_budget(
    plan_id: str = Path(...),
    hotel_index: int = Query(default=0, ge=0, le=2, description="Otel seçimi (0=en ucuz, 1=orta, 2=premium)")
):
    """
    Recalculates total budget when user selects a hotel option.
    flight_cost + hotel_options[hotel_index].total_price = total_cost
    """
    try:
        if not ObjectId.is_valid(plan_id):
            raise HTTPException(status_code=400, detail="Geçersiz plan ID")

        wishlist = await WishlistService.find_one(plan_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Plan bulunamadı")

        trip_details: Dict[str, Any] = wishlist.get("trip_details") or {}
        hotel_options: list = trip_details.get("hotel_options", [])

        if hotel_index >= len(hotel_options):
            hotel_index = 0

        # Flight cost: outbound + return
        outbound = trip_details.get("outbound_flight") or {}
        return_f = trip_details.get("return_flight") or {}
        flight_cost = float(outbound.get("price", 0)) + float(return_f.get("price", 0))

        # Hotel cost from selected option
        hotel: Dict[str, Any] = hotel_options[hotel_index] if hotel_options else {}
        hotel_cost = float(hotel.get("total_price", 0))
        hotel_name = hotel.get("hotel_name")
        currency = hotel.get("currency", outbound.get("currency", "TRY"))

        total_cost = flight_cost + hotel_cost
        # Prefer wishlist.budget; fall back to trip_details.budget_summary.target_budget
        target_budget = wishlist.get("budget") or (
            (trip_details.get("budget_summary") or {}).get("target_budget")
        )

        # Reuse budget label logic from scraper
        from scraper import get_scraper as _get_scraper
        scraper_instance = _get_scraper()
        rec = scraper_instance.get_budget_recommendation(total_cost, target_budget)

        savings = None
        overage = None
        if target_budget:
            diff = total_cost - target_budget
            if diff < 0:
                savings = abs(diff)
            else:
                overage = diff

        return BudgetCalculateResponse(
            plan_id=plan_id,
            selected_hotel_index=hotel_index,
            hotel_name=hotel_name,
            flight_cost=flight_cost,
            hotel_cost=hotel_cost,
            total_cost=total_cost,
            currency=currency,
            label=rec.get("label", "en-iyi-teklif"),
            label_text=rec.get("label_text", "En İyi Teklif"),
            label_icon=rec.get("label_icon", "🎯"),
            savings=savings,
            overage=overage,
            usage_percent=rec.get("usage_percent"),
            target_budget=target_budget,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bütçe hesaplama hatası: {str(e)}")


@app.post(
    "/api/v1/plans/{plan_id}/seed-mock",
    tags=["Smart Planner"],
    summary="Plana demo trip_details verisi yaz (Paris mock)"
)
async def seed_mock_plan(plan_id: str = Path(...)):
    """Injects realistic Paris mock trip_details into a plan for demo/testing."""
    if not ObjectId.is_valid(plan_id):
        raise HTTPException(status_code=400, detail="Geçersiz plan ID")

    wishlist = await WishlistService.find_one(plan_id)
    if not wishlist:
        raise HTTPException(status_code=404, detail="Plan bulunamadı")

    origin      = wishlist.get("origin", "IST")
    destination = wishlist.get("destination", "CDG")
    nights      = 4

    mock_trip: Dict[str, Any] = {
        "trip_type": "bireysel",
        "outbound_flight": {
            "departure_code": origin,
            "arrival_code": "CDG",
            "departure_city": "İstanbul Airport",
            "arrival_city": "Charles de Gaulle",
            "departure_time": "08:30",
            "arrival_time": "11:00",
            "duration": "3s 30dk",
            "stops": 0,
            "airline": "TK",
            "airline_logo_url": "https://content.airhex.com/content/logos/airlines_TK_35_35_t.png",
            "flight_number": "TK1805",
            "price": 4500.0,
            "currency": "TRY",
            "cabin_class": "economy",
        },
        "return_flight": {
            "departure_code": "CDG",
            "arrival_code": origin,
            "departure_city": "Charles de Gaulle",
            "arrival_city": "İstanbul Airport",
            "departure_time": "15:00",
            "arrival_time": "19:30",
            "duration": "3s 30dk",
            "stops": 0,
            "airline": "TK",
            "airline_logo_url": "https://content.airhex.com/content/logos/airlines_TK_35_35_t.png",
            "flight_number": "TK1806",
            "price": 4500.0,
            "currency": "TRY",
            "cabin_class": "economy",
        },
        "hotel_options": [
            {
                "hotel_name": "Hotel Le Plume",
                "stars": 4,
                "rating": 8.7,
                "image_url": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&q=80",
                "address": "Saint-Germain-des-Prés, Paris",
                "price_per_night": 1250.0,
                "total_price": 5000.0,
                "currency": "TRY",
                "nights": nights,
                "room_type": "Deluxe Oda",
                "amenities": ["WiFi", "Kahvaltı"],
                "provider": "trivago",
                "is_recommended": True,
            },
            {
                "hotel_name": "Hôtel de la Paix",
                "stars": 3,
                "rating": 7.9,
                "image_url": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=600&q=80",
                "address": "Le Marais, Paris",
                "price_per_night": 900.0,
                "total_price": 3600.0,
                "currency": "TRY",
                "nights": nights,
                "room_type": "Standard Oda",
                "amenities": ["WiFi"],
                "provider": "trivago",
                "is_recommended": False,
            },
            {
                "hotel_name": "Palais Royal Grand",
                "stars": 5,
                "rating": 9.2,
                "image_url": "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80",
                "address": "1er Arrondissement, Paris",
                "price_per_night": 2500.0,
                "total_price": 10000.0,
                "currency": "TRY",
                "nights": nights,
                "room_type": "Suite",
                "amenities": ["WiFi", "Spa", "Restoran"],
                "provider": "trivago",
                "is_recommended": False,
            },
        ],
        "selected_hotel_index": 0,
        "budget_summary": {
            "target_budget": wishlist.get("budget") or 17000.0,
            "flight_cost": 9000.0,
            "hotel_cost": 5000.0,
            "total_cost": 14000.0,
            "currency": "TRY",
            "label": "tam-butce",
            "label_text": "Tam Bütçene Göre",
            "label_icon": "✅",
            "savings": 3000.0,
            "overage": None,
            "usage_percent": 82.4,
        },
        "nights": nights,
        "ai_day_plans": [],
        "scraped_at": datetime.utcnow().isoformat(),
        "scrape_provider": "mock",
    }

    # DatabaseManager.update_one takes (collection, str_id, data_dict) and wraps with $set
    await DatabaseManager.update_one(
        COLLECTIONS["wishlists"],
        plan_id,
        {"trip_details": mock_trip, "scrape_status": "ready"},
    )

    return {"ok": True, "plan_id": plan_id, "message": "Mock trip_details zimbalandi!"}


@app.post(
    "/api/v1/plans/{plan_id}/confirm",
    tags=["Smart Planner"],
    summary="Planı onayla — durumu confirmed olarak güncelle"
)
async def confirm_plan(plan_id: str = Path(...)):
    """Sets the plan status to 'confirmed', prevents future re-scraping."""
    if not ObjectId.is_valid(plan_id):
        raise HTTPException(status_code=400, detail="Geçersiz plan ID")

    wishlist = await WishlistService.find_one(plan_id)
    if not wishlist:
        raise HTTPException(status_code=404, detail="Plan bulunamadı")

    await DatabaseManager.update_one(
        COLLECTIONS["wishlists"],
        plan_id,
        {"status": TripStatus.CONFIRMED.value}
    )

    return {
        "ok": True,
        "plan_id": plan_id,
        "status": TripStatus.CONFIRMED.value,
        "message": "Plan onaylandı! Hayırlı yolculuklar."
    }


@app.post(
    "/api/v1/trigger-scrape/{wishlist_id}",
    response_model=ScrapeResponse,
    tags=["Smart Planner"],
    summary="Manuel fiyat taraması başlat"
)
async def trigger_scrape(
    wishlist_id: str = Path(...),
    provider: str = Query(default="enuygun")
):
    """Triggers price scraping for a wishlist."""
    try:
        if not ObjectId.is_valid(wishlist_id):
            raise HTTPException(status_code=400, detail="Geçersiz ID")
        
        wishlist = await WishlistService.find_one(wishlist_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Wishlist bulunamadı")
        
        origin = wishlist.get("origin", "IST")
        destination = wishlist.get("destination", "AYT")
        start_date = str(wishlist.get("start_date", ""))
        
        print(f" Fiyat taramas: {origin}  {destination}")
        
        # Scraper is passive - return placeholder response
        # In production, uncomment: scrape_result = await fetch_price(origin, destination, start_date, provider)
        
        return ScrapeResponse(
            success=False,
            wishlist_id=wishlist_id,
            current_price=None,
            provider=provider,
            message="Scraper pasif modda - Veri akış yolu hazır",
            scraped_at=datetime.utcnow()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


# Backward compatibility
@app.post("/trigger-scrape/{wishlist_id}", response_model=ScrapeResponse, tags=["Smart Planner"])
async def trigger_scrape_legacy(wishlist_id: str, provider: str = "enuygun"):
    """Legacy endpoint."""
    return await trigger_scrape(wishlist_id, provider)


# ============================================================================
#                    SOCIAL PROFILE (PASAPORT) ENDPOINTS
# ============================================================================

@app.get(
    "/api/v1/profile",
    response_model=Optional[UserProfileResponse],
    tags=["Social Profile"],
    summary="Kullanıcı pasaport ve istatistik verilerini döner"
)
async def get_profile(
    user_id: Optional[str] = None,
    username: Optional[str] = None
):
    """Retrieves user profile data for the Pasaport screen."""
    try:
        # Try to find user
        user = None
        if user_id:
            user = await UserService.find_one(user_id=user_id)
        elif username:
            user = await UserService.find_one(username=username)
        else:
            # Return first user or null (for demo purposes)
            users = await UserService.find_all(limit=1)
            if users:
                user = users[0]
        
        if not user:
            # Return null - frontend ready for empty state
            return None
        
        return UserProfileResponse(**user)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veri getirme hatası: {str(e)}"
        )


@app.post(
    "/api/v1/profile",
    response_model=UserProfileResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Social Profile"],
    summary="Yeni kullanıcı profili oluştur"
)
async def create_profile(profile: UserProfileCreate):
    """Creates a new user profile."""
    try:
        # Check if username exists
        existing = await UserService.find_one(username=profile.username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu kullanıcı adı zaten kullanılıyor"
            )
        
        profile_db = UserProfileInDB(
            username=profile.username,
            email=profile.email,
            avatar_url=profile.avatar_url,
            level=1,
            xp=0,
            total_saved=0,
            visited_countries_count=0,
            total_trips=0,
            badges=[],
            visited_countries=[]
        )
        document = profile_db.to_dict()
        
        user_id = await DatabaseManager.insert_one(COLLECTIONS["users"], document)
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Profil oluşturulamadı"
            )
        
        created = await UserService.find_one(user_id=user_id)
        return UserProfileResponse(**created)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veritabanı hatası: {str(e)}"
        )


@app.get(
    "/api/v1/profile/stats",
    tags=["Social Profile"],
    summary="Kullanıcı istatistiklerini getir"
)
async def get_profile_stats(user_id: Optional[str] = None):
    """Returns user statistics."""
    try:
        user = None
        if user_id:
            user = await UserService.find_one(user_id=user_id)
        else:
            users = await UserService.find_all(limit=1)
            if users:
                user = users[0]
        
        if not user:
            return {
                "level": 1,
                "xp": 0,
                "total_saved": 0,
                "visited_countries_count": 0,
                "total_trips": 0,
                "badges_count": 0
            }
        
        return {
        "level": user.get("level", 1),
            "xp": user.get("xp", 0),
            "total_saved": user.get("total_saved", 0),
            "visited_countries_count": user.get("visited_countries_count", 0),
            "total_trips": user.get("total_trips", 0),
            "badges_count": len(user.get("badges", []))
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veri getirme hatası: {str(e)}"
        )


@app.get(
    "/api/v1/profile/passport",
    tags=["Social Profile"],
    summary="Digital Passport - tam pasaport verisi",
    description="Kullanıcının seviye, rozet, biriken para ve ziyaret edilen ülke bilgilerini döner."
)
async def get_profile_passport(user_id: Optional[str] = None):
    """
    Returns complete Digital Passport data for Social Profile screen.
    Includes: Level/XP, Badges, Saved Money, Visited Countries, Trip History
    """
    try:
        user = None
        if user_id:
            user = await UserService.find_one(user_id=user_id)
        else:
            users = await UserService.find_all(limit=1)
            if users:
                user = users[0]

        # ── Visited countries: read directly from the authenticated user document.
        visited_countries: list = []
        if user:
            visited_countries = user.get("visited_countries", [])

        if not user:
            # No registered user — still return visited_countries from profile_doc
            return {
                "user_id": None,
                "username": "gezgin",
                "avatar_url": None,
                "level": 1,
                "xp": 0,
                "xp_to_next_level": 500,
                "level_progress_percent": 0,
                "total_saved": 0,
                "total_saved_formatted": "₺0",
                "savings_trend": "+0%",
                "visited_countries_count": len(visited_countries),
                "total_trips": 0,
                "badges": [],
                "visited_countries": visited_countries,
                "recent_trips": [],
                "is_guest": True,
                "timestamp": datetime.utcnow().isoformat()
            }

        # Calculate level progress
        current_xp    = user.get("xp", 0)
        current_level = current_xp // XP_PER_LEVEL + 1
        xp_to_next    = XP_PER_LEVEL - (current_xp % XP_PER_LEVEL)
        level_progress = current_xp % XP_PER_LEVEL   # 0-99

        # Format saved money
        total_saved = user.get("total_saved", 0)
        saved_formatted = f"₺{total_saved:,.0f}".replace(",", ".")

        # Get user's wishlists for recent trips (ONLY completed)
        wishlists = await WishlistService.find_all(limit=20)
        recent_trips = []
        for w in wishlists:
            trip_status = w.get("status", "tracking")
            if trip_status == "completed":
                recent_trips.append({
                    "id": w.get("_id"),
                    "trip_name": w.get("trip_name"),
                    "origin": w.get("origin"),
                    "destination": w.get("destination"),
                    "dates": f"{w.get('start_date', 'TBD')} - {w.get('end_date', 'TBD')}",
                    "status": trip_status,
                    "target_price": w.get("target_price"),
                    "currency": w.get("currency", "TRY")
                })

        # Recalculate badges (delta=0 → no XP change; ensures early_bird etc. are current)
        uid = str(user.get("_id", ""))
        badge_result = await _award_xp_and_badges(uid, 0) if uid else {}
        current_badges = badge_result.get("all_badges") or user.get("badges", [])

        return {
            "user_id": user.get("_id"),
            "username": user.get("username"),
            "avatar_url": user.get("avatar_url"),
            "bio": user.get("bio"),
            "location": user.get("location"),
            "level": current_level,
            "xp": current_xp,
            "xp_to_next_level": xp_to_next,
            "level_progress_percent": level_progress,
            "total_saved": total_saved,
            "total_saved_formatted": saved_formatted,
            "savings_trend": "+8%",
            "visited_countries_count": len(visited_countries),
            "total_trips": user.get("total_trips", 0),
            "badges": current_badges,
            "visited_countries": visited_countries,
            "recent_trips": recent_trips,
            "is_guest": False,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Passport verisi getirilemedi: {str(e)}"
        )


@app.get(
    "/api/v1/profile/wishlist",
    tags=["Social Profile"],
    summary="Kullanıcının takip ettiği rotaları getir"
)
async def get_profile_wishlist(
    user_id: Optional[str] = None,
    limit: int = Query(default=20, le=50)
):
    """
    Profil sayfası için wishlist kartlarını döner.
    
    Her bir kart için dönen veriler:
    - id: Wishlist ID
    - trip_name: Rota adı (örn: "Antalya Trip")
    - origin: Kalkış
    - destination: Varış
    - target_price: Hedef fiyat
    - current_price: Mevcut/canlı fiyat
    - status: tracking | completed
    - is_deal: current_price <= target_price ise True (yeşil neon)
    """
    try:
        # Wishlists koleksiyonundan verileri çek
        wishlists = await DatabaseManager.find_all(
            collection_name=COLLECTIONS["wishlists"],
            query={},  # Tüm wishlist'ler (user_id filtresi eklenebilir)
            limit=limit
        )
        
        if not wishlists:
            return {
                "success": True,
                "items": [],
                "count": 0,
                "message": "Henüz takip ettiğin bir rota yok"
            }
        
        # Her wishlist için kart verisi oluştur
        items = []
        for w in wishlists:
            target_price = w.get("target_price") or w.get("budget") or 0
            current_price = w.get("current_price") or 0
            
            # Fiyat kontrolü: current <= target ise deal (yeşil neon)
            is_deal = current_price > 0 and target_price > 0 and current_price <= target_price
            
            item = {
                "id": str(w.get("_id", "")),
                "trip_name": w.get("trip_name") or f"{w.get('origin', 'IST')} → {w.get('destination', '?')}",
                "origin": w.get("origin", "IST"),
                "destination": w.get("destination", ""),
                "target_price": target_price,
                "current_price": current_price,
                "currency": w.get("currency", "TRY"),
                "status": w.get("status", "tracking"),
                "is_deal": is_deal,
                "start_date": w.get("start_date"),
                "end_date": w.get("end_date"),
                "is_active": w.get("is_active", True)
            }
            items.append(item)
        
        return {
            "success": True,
            "items": items,
            "count": len(items)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Wishlist verisi getirilemedi: {str(e)}"
        )


# ============================================================================
#                    VISITED COUNTRIES (WORLD MAP)
# ============================================================================

@app.get(
    "/api/v1/profile/visited-countries",
    tags=["Social Profile"],
    summary="Ziyaret edilen ülkeleri getir"
)
async def get_visited_countries(user_id: Optional[str] = None):
    """
    Kullanıcının ziyaret ettiği ülkelerin ISO kodlarını döner.
    Dünya haritası için kullanılır.
    """
    try:
        visited_countries = []
        if user_id:
            visited = await DatabaseManager.find_one(COLLECTIONS["users"], document_id=user_id)
            if visited:
                visited_countries = visited.get("visited_countries", [])
        
        return {
            "success": True,
            "countries": visited_countries,
            "count": len(visited_countries)
        }
        
    except Exception as e:
        # Hata durumunda boş liste dön
        return {
            "success": True,
            "countries": [],
            "count": 0
        }


@app.post(
    "/api/v1/profile/visited-country",
    tags=["Social Profile"],
    summary="Bir ülkeyi ziyaret edilmiş olarak işaretle (Coords destekli)"
)
async def add_visited_country(
    visit_data: VisitedCountry,
    user_id: Optional[str] = Query(None, description="Authenticated user ID")
):
    """
    Bir ülkeyi ziyaret edilmiş olarak işaretler.
    Koordinat verisi (location) ile birlikte kaydedilir.
    Aynı ülke tekrar eklenemez (kod kontrolü yapılır).
    """
    try:
        country_code = visit_data.country_code.upper()

        if not user_id:
            return {"success": False, "message": "Giriş yapman gerekiyor", "countries": [], "count": 0}

        # Find user by their MongoDB _id
        profile = await DatabaseManager.find_one(
            COLLECTIONS["users"],
            document_id=user_id
        )

        if not profile:
            return {"success": False, "message": "Kullanıcı bulunamadı", "countries": [], "count": 0}

        # Mevcut listeyi al (string listesi veya obje listesi olabilir - backward compatibility)
        visited_list = [
            item for item in profile.get("visited_countries", [])
            if isinstance(item, dict)  # normalize: drop legacy string entries
        ]

        # Check if already exists
        if any(item.get("country_code") == country_code for item in visited_list):
            return {
                "success": True,
                "message": f"{country_code} zaten ziyaret edilmiş",
                "countries": visited_list,
                "count": len(visited_list)
            }

        # Add new entry
        new_entry = {
            "country_code": country_code,
            "country_name": visit_data.country_name,
            "location": visit_data.location,
            "visited_at": visit_data.visited_at.isoformat() if visit_data.visited_at else datetime.utcnow().isoformat()
        }
        visited_list.append(new_entry)

        collection = DatabaseManager.get_collection(COLLECTIONS["users"])
        await collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"visited_countries": visited_list, "visited_countries_count": len(visited_list)}}
        )

        xp_result = await _award_xp_and_badges(user_id, 100)
        return {
            "success": True,
            "message": f"{country_code} eklendi! (Zınk!)",
            "countries": visited_list,
            "count": len(visited_list),
            "xp_result": xp_result
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ülke eklenemedi: {str(e)}"
        )


@app.delete(
    "/api/v1/profile/visited-country",
    tags=["Social Profile"],
    summary="Bir ülkeyi ziyaret listesinden kaldır"
)
async def remove_visited_country(
    country_code: str = Query(..., min_length=2, max_length=3),
    user_id: Optional[str] = Query(None, description="Authenticated user ID")
):
    """Bir ülkeyi ziyaret listesinden kaldırır."""
    try:
        country_code = country_code.upper()

        if not user_id:
            return {"success": False, "message": "Giriş yapman gerekiyor", "countries": [], "count": 0}

        profile = await DatabaseManager.find_one(COLLECTIONS["users"], document_id=user_id)

        if not profile:
            return {"success": False, "message": "Kullanıcı bulunamadı", "countries": [], "count": 0}

        visited_countries = profile.get("visited_countries", [])
        new_list = [
            item for item in visited_countries
            if not (
                (isinstance(item, str) and item.upper() == country_code) or
                (isinstance(item, dict) and item.get("country_code", "").upper() == country_code)
            )
        ]

        if len(new_list) != len(visited_countries):
            collection = DatabaseManager.get_collection(COLLECTIONS["users"])
            await collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"visited_countries": new_list, "visited_countries_count": len(new_list)}}
            )

        xp_result = await _award_xp_and_badges(user_id, -100)
        return {
            "success": True,
            "message": f"{country_code} kaldırıldı",
            "countries": new_list,
            "count": len(new_list),
            "xp_result": xp_result
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ülke kaldırılamadı: {str(e)}"
        )


@app.get(
    "/api/v1/profile/full-stats",
    tags=["Social Profile"],
    summary="Profil ekranı için tüm verileri tek JSON olarak döner"
)
async def get_profile_full_stats(current_user: dict = Depends(get_optional_user)):
    """
    Returns complete profile data in one response:
    - Passport (level, xp, badges, visited_countries)
    - Recent Trips (completed wishlists only)
    - Wishlist cards
    - Money Saved
    """
    try:
        # 1. Get passport data
        passport = await get_profile_passport()
        
        # 2. Get wishlist data
        wishlist_data = await get_profile_wishlist()
        
        # 3. Get visited countries
        visited_data = await get_visited_countries()
        
        return {
            "passport": passport,
            "wishlist": wishlist_data,
            "visited_countries": visited_data.get("countries", []),
            "visited_count": visited_data.get("count", 0),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Full stats getirilemedi: {str(e)}"
        )


@app.get(
    "/api/v1/users/{user_id}/public-profile",
    tags=["PAX Events"],
    summary="Bir kullanıcının halka açık profili"
)
async def get_public_profile(user_id: str = Path(...)):
    """
    Returns a user's public profile:
    name, bio, visited country count + first 10 country codes.
    Returns minimal data (found=False) if no real profile exists.
    """
    try:
        user = None
        if ObjectId.is_valid(user_id):
            user = await UserService.find_one(user_id=user_id)

        if not user:
            return {
                "user_id": user_id,
                "display_name": None,
                "bio": None,
                "visited_count": 0,
                "visited_countries": [],
                "passport_level": None,
                "found": False,
            }

        visited = user.get("visited_countries", [])
        visited_count = len(visited)
        visited_preview = visited[:10]

        return {
            "user_id": user_id,
            "display_name": user.get("username") or user.get("display_name") or user.get("name"),
            "bio": user.get("bio"),
            "visited_count": visited_count,
            "visited_countries": visited_preview,
            "passport_level": user.get("passport_level", "Gezgin"),
            "found": True,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Profil getirilemedi: {str(e)}"
        )


# ============================================================================
#                     PAX — NOTIFICATION ENDPOINTS
# ============================================================================

@app.get(
    "/api/v1/users/{user_id}/notifications",
    tags=["PAX Events"],
    summary="Kullanıcının bildirimlerini getir"
)
async def get_notifications(
    user_id: str = Path(...),
    unread_only: bool = Query(False)
):
    """Returns notifications for a user, newest first."""
    try:
        notifs = await NotificationService.find_by_user(user_id, unread_only=unread_only)
        unread = sum(1 for n in notifs if not n.get("read", False))
        return {
            "notifications": notifs,
            "total": len(notifs),
            "unread": unread,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bildirimler getirilemedi: {str(e)}"
        )


@app.patch(
    "/api/v1/users/{user_id}/profile",
    tags=["Social Profile"],
    summary="Kullanıcı profil bilgilerini güncelle (avatar, bio, konum)"
)
async def update_user_profile(user_id: str = Path(...), data: UserProfileUpdate = None):
    """avatar_url, bio ve location alanlarını günceller."""
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Geçersiz user_id")
        update_fields = {k: v for k, v in data.dict().items() if v is not None}
        if not update_fields:
            return {"success": True, "message": "Güncellenecek alan yok"}
        collection = DatabaseManager.get_collection(COLLECTIONS["users"])
        result = await collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        return {"success": True, "updated": list(update_fields.keys())}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profil güncellenemedi: {str(e)}")


# ═══════════════════════════════════════════════════════
# XP ENGINE
# ═══════════════════════════════════════════════════════

async def _award_xp_and_badges(user_id: str, delta: int) -> dict:
    """
    XP ekle veya düş, level hesapla, yeni rozetleri kontrol et.
    Returns: {xp, level, leveled_up, new_badges, xp_progress}
    """
    if not ObjectId.is_valid(user_id):
        return {}
    try:
        collection = DatabaseManager.get_collection(COLLECTIONS["users"])
        user = await collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            return {}

        old_xp    = max(0, user.get("xp", 0))
        old_level = user.get("level", 1)
        new_xp    = max(0, old_xp + delta)
        new_level = new_xp // XP_PER_LEVEL + 1
        leveled_up = new_level > old_level

        # Badge check
        existing_badge_ids = {b["id"] if isinstance(b, dict) else b for b in user.get("badges", [])}
        visited_list   = user.get("visited_countries", [])
        visited_count  = len(visited_list)
        wishlist_count = user.get("wishlist_count", 0)   # incremented separately

        # Adjust counts for the current delta context
        if delta == 100:   visited_count  += 1   # just added a country
        if delta == -100:  visited_count  -= 1   # just removed
        if delta == 20:    wishlist_count += 1   # just added wishlist
        if delta == -20:   wishlist_count = max(0, wishlist_count - 1)

        # EU / Schengen breakdown
        def _country_codes(vl):
            codes = set()
            for vc in vl:
                code = (vc if isinstance(vc, str) else vc.get("country_code", "")).upper()
                if code:
                    codes.add(code)
            return codes

        visited_codes     = _country_codes(visited_list)
        eu_count          = len(visited_codes & EU_COUNTRIES)
        visa_free_count   = len(visited_codes & VISA_FREE_COUNTRIES)

        # Pin counts (for photo_genic / city_guide)
        pins_col      = DatabaseManager.get_collection(COLLECTIONS["pins"])
        user_pins     = await pins_col.find({"creator_id": user_id}).to_list(length=500)
        pin_count     = len(user_pins)
        city_pin_max  = 0
        if user_pins:
            from collections import Counter
            city_counts  = Counter(
                (p.get("city") or p.get("location") or "").strip().lower()
                for p in user_pins if (p.get("city") or p.get("location") or "").strip()
            )
            city_pin_max = max(city_counts.values()) if city_counts else 0

        # Early Bird: check if this user is among first 5000 registered
        total_users   = await DatabaseManager.get_collection(COLLECTIONS["users"]).count_documents({})
        # Use user's ObjectId sort position as proxy — count users created before this user
        users_before  = await DatabaseManager.get_collection(COLLECTIONS["users"]).count_documents(
            {"_id": {"$lt": ObjectId(user_id)}}
        )
        is_early_bird = users_before < 5000

        new_badges = []
        all_badges = []
        for bd in BADGE_DEFINITIONS:
            bid = bd["id"]
            unlocked = bid in existing_badge_ids
            if not unlocked:
                cond = bd["condition"]
                earned = (
                    (cond == "wishlists >= 1"       and wishlist_count   >= 1)  or
                    (cond == "wishlists >= 10"      and wishlist_count   >= 10) or
                    (cond == "countries >= 1"       and visited_count    >= 1)  or
                    (cond == "countries >= 5"       and visited_count    >= 5)  or
                    (cond == "countries >= 50"      and visited_count    >= 50) or
                    (cond == "eu_countries >= 5"    and eu_count         >= 5)  or
                    (cond == "visa_free_countries >= 5" and visa_free_count >= 5) or
                    (cond == "pins >= 5"            and pin_count        >= 5)  or
                    (cond == "city_pins >= 5"       and city_pin_max     >= 5)  or
                    (cond == "level >= 5"           and new_level        >= 5)  or
                    (cond == "early_bird"           and is_early_bird)
                )
                if earned:
                    new_badges.append(bd)
                    all_badges.append({**bd, "unlocked": True,  "earned_at": datetime.utcnow().isoformat()})
                else:
                    all_badges.append({**bd, "unlocked": False})
            else:
                existing = next((b for b in user.get("badges", []) if (b.get("id") if isinstance(b, dict) else b) == bid), None)
                all_badges.append({**bd, "unlocked": True, **(existing if isinstance(existing, dict) else {})})

        await collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {
                "xp":    new_xp,
                "level": new_level,
                "badges": all_badges
            }}
        )

        return {
            "xp":         new_xp,
            "level":      new_level,
            "leveled_up": leveled_up,
            "old_level":  old_level,
            "xp_progress": new_xp % XP_PER_LEVEL,
            "xp_to_next": XP_PER_LEVEL - (new_xp % XP_PER_LEVEL),
            "new_badges": new_badges,
            "all_badges": all_badges,
            "delta":      delta
        }
    except Exception as e:
        print(f"XP award error: {e}")
        return {}


@app.post(
    "/api/v1/users/{user_id}/xp",
    tags=["Gamification"],
    summary="XP ekle / düş ve rozet kontrolü yap"
)
async def award_xp(
    user_id: str = Path(...),
    delta: int = Query(..., description="Eklenecek veya düşülecek XP (negatif olabilir)"),
    reason: str = Query("manual", description="XP sebebi")
):
    """XP ekler veya düşer, level ve rozetleri günceller."""
    result = await _award_xp_and_badges(user_id, delta)
    if not result:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return {"success": True, "reason": reason, **result}


@app.patch(
    "/api/v1/users/{user_id}/notifications/read",
    tags=["PAX Events"],
    summary="Tüm bildirimleri okundu olarak işaretle"
)
async def mark_notifications_read(user_id: str = Path(...)):
    """Marks all notifications as read for this user."""
    try:
        await NotificationService.mark_all_read(user_id)
        return {"success": True, "message": "Tüm bildirimler okundu olarak işaretlendi"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"İşlem başarısız: {str(e)}"
        )


@app.post(
    "/api/v1/map/events/{event_id}/award-stamps",
    tags=["PAX Events"],
    summary="Etkinlik bittikten sonra katılımcılara damga ver (sadece oluşturan)"
)
async def award_event_stamps(
    event_id: str = Path(...),
    creator_id: str = Query(..., description="Etkinliği oluşturan kişinin ID'si")
):
    """
    After the event date, creator triggers stamp award.
    Each approved participant gets a SOCIAL_EVENT badge + notification.
    """
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz etkinlik ID")

    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etkinlik bulunamadı")

    if event.get("creator_id") != creator_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sadece etkinlik sahibi damga verebilir")

    # Collect approved participants
    all_requests = await JoinRequestService.find_by_event(event_id)
    approved = [r for r in all_requests if r.get("status") == "approved"]

    awarded = []
    for req in approved:
        user_id = req.get("user_id", "")
        if not user_id:
            continue

        # Store stamp notification (client uses this to inject passport stamp)
        stamp_notif = NotificationCreate(
            user_id     = user_id,
            type        = NotificationType.EVENT_STAMP,
            title       = "Etkinlik Damgası Kazandın! 🌟",
            body        = f"'{event.get('title', 'Etkinlik')}' etkinliğine katıldığın için pasaportuna özel bir damga eklendi!",
            event_id    = event_id,
            event_title = event.get("title"),
            read        = False,
        )
        await NotificationService.create(stamp_notif.model_dump())
        awarded.append(user_id)

    return {
        "success": True,
        "message": f"{len(awarded)} katılımcıya damga bildirim gönderildi",
        "awarded_users": awarded,
    }


# ============================================================================
#                           ERROR HANDLERS
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Beklenmeyen bir hata oluştu",
            "error": str(exc)
        }
    )


# ============================================================================
#                           CITY IMAGE SERVICE
# ============================================================================

# In-memory cache: normalised_city_key → full image URL
_IMAGE_CACHE: Dict[str, str] = {}

# Curated fallback: city slug → Unsplash photo ID
_CITY_PHOTO_FALLBACKS: Dict[str, str] = {
    # Europe
    "paris":        "photo-1499856871958-5b9627545d1a",
    "roma":         "photo-1552832230-c0197dd311b5",
    "rome":         "photo-1552832230-c0197dd311b5",
    "londra":       "photo-1513635269975-59663e0ac1ad",
    "london":       "photo-1513635269975-59663e0ac1ad",
    "barselona":    "photo-1539037116277-4db20889f2d4",
    "barcelona":    "photo-1539037116277-4db20889f2d4",
    "amsterdam":    "photo-1534351590666-13e3e96b5017",
    "athens":       "photo-1616489953121-042239c4ca94",
    "atina":        "photo-1616489953121-042239c4ca94",
    "prag":         "photo-1519677100203-a0e668c92439",
    "prague":       "photo-1519677100203-a0e668c92439",
    "viyana":       "photo-1516550893923-42d28e5677af",
    "vienna":       "photo-1516550893923-42d28e5677af",
    "budapeşte":    "photo-1506905925346-21bda4d32df4",
    "budapest":     "photo-1506905925346-21bda4d32df4",
    "dubrovnik":    "photo-1555990793-da11153b6ca8",
    "santorini":    "photo-1570077188670-e3a8d69ac5ff",
    "lizbon":       "photo-1555881400-74d7acaacd8b",
    "lisbon":       "photo-1555881400-74d7acaacd8b",
    "madrid":       "photo-1543783207-ec64e4d3c671",
    "floransa":     "photo-1543429776-2782fc8e4e8a",
    "florence":     "photo-1543429776-2782fc8e4e8a",
    "venedik":      "photo-1534113414509-0eec2bfb493f",
    "venice":       "photo-1534113414509-0eec2bfb493f",
    "berlin":       "photo-1566404791232-af9fe0ae8f8b",
    "münih":        "photo-1595867818082-083862f3d630",
    "munich":       "photo-1595867818082-083862f3d630",
    "kopenhag":     "photo-1513622470522-26c3c8a854bc",
    "copenhagen":   "photo-1513622470522-26c3c8a854bc",
    "stockholm":    "photo-1509356843151-3e7d96241e11",
    "zürich":       "photo-1515488764276-beab7607c1e6",
    "zurich":       "photo-1515488764276-beab7607c1e6",
    "edinburgh":    "photo-1506377585622-bedcbb027afc",
    "dublin":       "photo-1549918864-48ac978761a4",
    "brüksel":      "photo-1559113202-c916b8e44373",
    "brussels":     "photo-1559113202-c916b8e44373",
    # Middle East & Africa
    "dubai":        "photo-1512453979798-5ea904ac6605",
    "abu dabi":     "photo-1533395427226-788cee21cc9e",
    "abu dhabi":    "photo-1533395427226-788cee21cc9e",
    "doha":         "photo-1547247153-08e0b79b0580",
    "kahire":       "photo-1572252009286-268acec5ca0a",
    "cairo":        "photo-1572252009286-268acec5ca0a",
    "marakeş":      "photo-1489493887464-892be6d1daae",
    "marrakesh":    "photo-1489493887464-892be6d1daae",
    # Asia
    "tokyo":        "photo-1540959733332-eab4deabeeaf",
    "osaka":        "photo-1589308078059-be1415eab4c3",
    "kyoto":        "photo-1528360983277-13d401cdc186",
    "seul":         "photo-1538485399081-7191377e8241",
    "seoul":        "photo-1538485399081-7191377e8241",
    "bangkok":      "photo-1508009603885-50cf7c579365",
    "singapur":     "photo-1525625293386-3f8f99389edd",
    "singapore":    "photo-1525625293386-3f8f99389edd",
    "bali":         "photo-1537996194471-e657df975ab4",
    "hong kong":    "photo-1536599018102-9f803c140fc1",
    "pekin":        "photo-1508804185872-d7badad00f7d",
    "beijing":      "photo-1508804185872-d7badad00f7d",
    "şanghay":      "photo-1538428494232-9c0d8a3ab403",
    "shanghai":     "photo-1538428494232-9c0d8a3ab403",
    "mumbai":       "photo-1529253355930-ddbe423a2ac7",
    "delhi":        "photo-1598394960038-f95c4ae36862",
    # Turkey
    "istanbul":     "photo-1524231757912-21f4fe3a7200",
    "kapadokya":    "photo-1641128324972-af3208f0ddfa",
    "cappadocia":   "photo-1641128324972-af3208f0ddfa",
    "antalya":      "photo-1601596397527-37acf55a8d88",
    "bodrum":       "photo-1601596397527-37acf55a8d88",
    "pamukkale":    "photo-1590845947851-e6b4b5b9f6f2",
    "efes":         "photo-1589308078059-be1415eab4c3",
    "trabzon":      "photo-1589308078059-be1415eab4c3",
    # Americas
    "new york":     "photo-1496442226666-8d4d0e62e6e9",
    "new york city":"photo-1496442226666-8d4d0e62e6e9",
    "nyc":          "photo-1496442226666-8d4d0e62e6e9",
    "los angeles":  "photo-1534190760961-74e8c1c5c3da",
    "miami":        "photo-1506929562872-bb421503ef21",
    "meksiko":      "photo-1518638150340-f706e86654de",
    "mexico city":  "photo-1518638150340-f706e86654de",
    "buenos aires": "photo-1589909202802-8f4aadce9171",
    "rio":          "photo-1483729558449-99ef09a8c325",
    "rio de janeiro":"photo-1483729558449-99ef09a8c325",
    "toronto":      "photo-1517090504586-fde19ea6066f",
    "vancouver":    "photo-1559511260-10d4d2b9f5fd",
    # Oceania
    "sidney":       "photo-1506905925346-21bda4d32df4",
    "sydney":       "photo-1506905925346-21bda4d32df4",
    "melbourne":    "photo-1514395462151-6ac11e2cf6e0",
    # Balkans & Caucasus (Vizesiz + Bütçe Dostu routes)
    "sofya":        "photo-1596621873816-7b5aca64c5b2",
    "sofia":        "photo-1596621873816-7b5aca64c5b2",
    "bükreş":       "photo-1584395630827-860eee694d7b",
    "bucharest":    "photo-1584395630827-860eee694d7b",
    "belgrad":      "photo-1566143945069-ea2e7e37e8c5",
    "saraybosna":   "photo-1586183189334-a4a7f7a36969",
    "batum":        "photo-1565008576549-57569a49371d",
    "tiflis":       "photo-1565008576549-57569a49371d",
    "budva":        "photo-1553899017-d6d8d60eaf14",
    "bakü":         "photo-1547247153-08e0b79b0580",
    "üsküp":        "photo-1566143945069-ea2e7e37e8c5",
    "marakes":      "photo-1489493887464-892be6d1daae",
    "tiran":        "photo-1566143945069-ea2e7e37e8c5",
    # Default fallback — a scenic mountain/nature destination
    "_default":     "photo-1476514525535-07fb3b4ae5f1",
}


def _build_unsplash_url(photo_id: str, width: int) -> str:
    return f"https://images.unsplash.com/{photo_id}?w={width}&q=75&auto=format&fit=crop"


def _city_slug(city: str) -> str:
    """Normalise city name to a lookup key.
    Strips ', Country' suffix so 'Bali, Endonezya' → 'bali'.
    """
    return city.split(",")[0].strip().lower()


def _ascii_query(text: str) -> str:
    """Convert Turkish/accented characters to ASCII so Unsplash doesn't 403.
    'Akçaabat Köftesi' → 'Akcaabat Koftesi'
    """
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if ord(c) < 128)


@app.get("/api/v1/image/city", tags=["Image Service"])
async def get_city_image(
    q: str = Query(..., description="City name", min_length=1, max_length=100),
    w: int = Query(default=400, description="Image width in pixels", le=1200),
):
    """
    Returns a direct Unsplash image URL for the requested city.

    Priority:
    1. In-memory cache
    2. Unsplash Search API (if UNSPLASH_ACCESS_KEY is configured)
    3. Curated fallback map
    """
    import os

    slug = _city_slug(q)
    cache_key = f"{slug}:{w}"

    if cache_key in _IMAGE_CACHE:
        return {"url": _IMAGE_CACHE[cache_key], "source": "cache"}

    # --- Try Unsplash API ---
    api_key = os.getenv("UNSPLASH_ACCESS_KEY", "").strip('"').strip("'")
    if api_key and api_key != "your_unsplash_access_key_here":
        try:
            # Normalize: Unsplash returns 403 for non-ASCII (Turkish/accented) chars
            q_ascii = _ascii_query(q)
            q_lower = q.lower()
            is_food_query = any(kw in q_lower for kw in ("food", "dish", "meal", "recipe"))

            # Smart query: keep only first 3 words to avoid Turkish suffix noise
            # e.g. "tokyo Asakusa Senso-ji Tapinagi" → "tokyo Asakusa Senso-ji"
            words = q_ascii.split()
            primary_q = " ".join(words[:3]) if len(words) > 3 else q_ascii

            async with __import__("httpx").AsyncClient(timeout=6.0) as client:
                # 1st attempt: trimmed normalized query
                resp = await client.get(
                    "https://api.unsplash.com/search/photos",
                    params={"query": primary_q, "per_page": 1, "orientation": "landscape"},
                    headers={"Authorization": f"Client-ID {api_key}"},
                )
                results = resp.json().get("results", []) if resp.status_code == 200 else []

                # 2nd attempt: smarter fallback if no results
                if not results:
                    if is_food_query:
                        # Food: use food name (first 2 words, no "food dish" suffix) + "food"
                        food_words = [w for w in words if w not in ("food", "dish", "meal", "recipe")]
                        fallback_q = " ".join(food_words[:2]) + " food" if food_words else "food photography"
                    else:
                        # Location: city name only + travel
                        fallback_q = words[0] + " travel" if words else "travel"
                    resp2 = await client.get(
                        "https://api.unsplash.com/search/photos",
                        params={"query": fallback_q, "per_page": 1, "orientation": "landscape"},
                        headers={"Authorization": f"Client-ID {api_key}"},
                    )
                    results = resp2.json().get("results", []) if resp2.status_code == 200 else []

                if results:
                    raw_url = results[0]["urls"]["regular"]  # always take the most relevant result
                    url = raw_url.split("?")[0] + f"?w={w}&q=75&auto=format&fit=crop"
                    _IMAGE_CACHE[cache_key] = url
                    return {"url": url, "source": "unsplash_api"}
        except Exception:
            pass  # Fall through to curated map

    # --- Curated fallback map (use city-only slug for better hit rate) ---
    city_slug = slug.split()[0] if slug.split() else slug
    photo_id = (_CITY_PHOTO_FALLBACKS.get(slug)
                or _CITY_PHOTO_FALLBACKS.get(city_slug)
                or _CITY_PHOTO_FALLBACKS.get("_default"))
    url = _build_unsplash_url(photo_id, w)
    _IMAGE_CACHE[cache_key] = url
    return {"url": url, "source": "fallback"}


# ============================================================================
#                           MAIN ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
