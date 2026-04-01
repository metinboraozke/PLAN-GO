"""
PLANİGO - Profile Router
Social Profile / Pasaport + Visited Countries + XP + Notifications + City Image endpoint'leri.
Extracted from main.py lines 1091-2039.
"""

from datetime import datetime
from typing import Dict, List, Optional, Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from database import DatabaseManager, UserService, WishlistService, NotificationService, EventPinService, JoinRequestService, COLLECTIONS
from models import (
    UserProfileCreate,
    UserProfileInDB,
    UserProfileResponse,
    UserProfileUpdate,
    VisitedCountry,
    NotificationCreate,
    NotificationType,
)
from services.gamification_service import award_xp_and_badges, XP_PER_LEVEL
from auth import get_optional_user, get_current_user

router = APIRouter(tags=["Social Profile"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_user(user_id: Optional[str] = None, username: Optional[str] = None) -> Optional[dict]:
    """user_id veya username'e göre kullanıcı döner; ikisi de yoksa ilk kullanıcıyı döner."""
    if user_id:
        return await UserService.find_one(user_id=user_id)
    if username:
        return await UserService.find_one(username=username)
    users = await UserService.find_all(limit=1)
    return users[0] if users else None


# ── Profile CRUD ──────────────────────────────────────────────────────────────

@router.get("/api/v1/profile", summary="Kullanıcı pasaport verilerini döner")
async def get_profile(
    user_id:  Optional[str] = None,
    username: Optional[str] = None,
):
    try:
        user = await _get_user(user_id, username)
        if not user:
            return JSONResponse(content=None, status_code=200)
        # Return raw user data — Badge schema in DB may differ from Pydantic model
        user.pop("password_hash", None)
        return JSONResponse(content=jsonable_encoder(user), status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri getirme hatası: {str(e)}")


@router.post("/api/v1/profile", response_model=UserProfileResponse, status_code=201, summary="Yeni kullanıcı profili oluştur")
async def create_profile(profile: UserProfileCreate):
    try:
        existing = await UserService.find_one(username=profile.username)
        if existing:
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
        profile_db = UserProfileInDB(username=profile.username, email=profile.email, avatar_url=profile.avatar_url, level=1, xp=0, total_saved=0, visited_countries_count=0, total_trips=0, badges=[], visited_countries=[])
        user_id = await DatabaseManager.insert_one(COLLECTIONS["users"], profile_db.to_dict())
        if not user_id:
            raise HTTPException(status_code=500, detail="Profil oluşturulamadı")
        created = await UserService.find_one(user_id=user_id)
        return UserProfileResponse(**created)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veritabanı hatası: {str(e)}")


@router.get("/api/v1/profile/stats", summary="Kullanıcı istatistiklerini getir")
async def get_profile_stats(user_id: Optional[str] = None):
    try:
        user = await _get_user(user_id)
        if not user:
            return {"level": 1, "xp": 0, "total_saved": 0, "visited_countries_count": 0, "total_trips": 0, "badges_count": 0}
        return {"level": user.get("level", 1), "xp": user.get("xp", 0), "total_saved": user.get("total_saved", 0), "visited_countries_count": user.get("visited_countries_count", 0), "total_trips": user.get("total_trips", 0), "badges_count": len(user.get("badges", []))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri getirme hatası: {str(e)}")


@router.get("/api/v1/profile/passport", summary="Digital Passport — tam pasaport verisi")
async def get_profile_passport(user_id: Optional[str] = None):
    try:
        user = await _get_user(user_id)
        visited_countries: list = user.get("visited_countries", []) if user else []

        if not user:
            return {"user_id": None, "username": "gezgin", "avatar_url": None, "level": 1, "xp": 0, "xp_to_next_level": 500, "level_progress_percent": 0, "total_saved": 0, "total_saved_formatted": "₺0", "savings_trend": "+0%", "visited_countries_count": len(visited_countries), "total_trips": 0, "badges": [], "visited_countries": visited_countries, "recent_trips": [], "is_guest": True, "timestamp": datetime.utcnow().isoformat()}

        current_xp     = user.get("xp", 0)
        current_level  = current_xp // XP_PER_LEVEL + 1
        xp_to_next     = XP_PER_LEVEL - (current_xp % XP_PER_LEVEL)
        level_progress = current_xp % XP_PER_LEVEL
        total_saved    = user.get("total_saved", 0)
        saved_formatted = f"₺{total_saved:,.0f}".replace(",", ".")

        wishlists    = await WishlistService.find_all(limit=20)
        recent_trips = [{"id": w.get("_id"), "trip_name": w.get("trip_name"), "origin": w.get("origin"), "destination": w.get("destination"), "dates": f"{w.get('start_date', 'TBD')} - {w.get('end_date', 'TBD')}", "status": w.get("status", "tracking"), "target_price": w.get("target_price"), "currency": w.get("currency", "TRY")} for w in wishlists if w.get("status") == "completed"]

        uid          = str(user.get("_id", ""))
        badge_result = await award_xp_and_badges(uid, 0) if uid else {}
        current_badges = badge_result.get("all_badges") or user.get("badges", [])

        return {"user_id": user.get("_id"), "username": user.get("username"), "avatar_url": user.get("avatar_url"), "bio": user.get("bio"), "location": user.get("location"), "level": current_level, "xp": current_xp, "xp_to_next_level": xp_to_next, "level_progress_percent": level_progress, "total_saved": total_saved, "total_saved_formatted": saved_formatted, "savings_trend": "+8%", "visited_countries_count": len(visited_countries), "total_trips": user.get("total_trips", 0), "badges": current_badges, "visited_countries": visited_countries, "recent_trips": recent_trips, "is_guest": False, "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Passport verisi getirilemedi: {str(e)}")


@router.get("/api/v1/profile/wishlist", summary="Kullanıcının takip ettiği rotaları getir")
async def get_profile_wishlist(
    user_id: Optional[str] = None,
    limit:   int           = Query(default=20, le=50),
):
    try:
        wishlists = await DatabaseManager.find_all(collection_name=COLLECTIONS["wishlists"], query={}, limit=limit)
        if not wishlists:
            return {"success": True, "items": [], "count": 0, "message": "Henüz takip ettiğin bir rota yok"}
        items = []
        for w in wishlists:
            target_price  = w.get("target_price") or w.get("budget") or 0
            current_price = w.get("current_price") or 0
            is_deal       = current_price > 0 and target_price > 0 and current_price <= target_price
            items.append({"id": str(w.get("_id", "")), "trip_name": w.get("trip_name") or f"{w.get('origin', 'IST')} → {w.get('destination', '?')}", "origin": w.get("origin", "IST"), "destination": w.get("destination", ""), "target_price": target_price, "current_price": current_price, "currency": w.get("currency", "TRY"), "status": w.get("status", "tracking"), "is_deal": is_deal, "start_date": w.get("start_date"), "end_date": w.get("end_date"), "is_active": w.get("is_active", True)})
        return {"success": True, "items": items, "count": len(items)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Wishlist verisi getirilemedi: {str(e)}")


@router.get("/api/v1/profile/full-stats", summary="Profil ekranı için tüm verileri tek JSON olarak döner")
async def get_profile_full_stats():
    try:
        passport       = await get_profile_passport()
        wishlist_data  = await get_profile_wishlist()
        visited_data   = await get_visited_countries()
        return {"passport": passport, "wishlist": wishlist_data, "visited_countries": visited_data.get("countries", []), "visited_count": visited_data.get("count", 0), "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Full stats getirilemedi: {str(e)}")


# ── Visited Countries ─────────────────────────────────────────────────────────

@router.get("/api/v1/profile/visited-countries", summary="Ziyaret edilen ülkeleri getir")
async def get_visited_countries(user_id: Optional[str] = None):
    try:
        visited_countries = []
        if user_id:
            visited = await DatabaseManager.find_one(COLLECTIONS["users"], document_id=user_id)
            if visited:
                visited_countries = visited.get("visited_countries", [])
        return {"success": True, "countries": visited_countries, "count": len(visited_countries)}
    except Exception:
        return {"success": True, "countries": [], "count": 0}


@router.post("/api/v1/profile/visited-country", summary="Bir ülkeyi ziyaret edilmiş olarak işaretle")
async def add_visited_country(
    visit_data:   VisitedCountry,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    try:
        country_code = visit_data.country_code.upper()
        profile = await DatabaseManager.find_one(COLLECTIONS["users"], document_id=user_id)
        if not profile:
            return {"success": False, "message": "Kullanıcı bulunamadı", "countries": [], "count": 0}

        visited_list = [item for item in profile.get("visited_countries", []) if isinstance(item, dict)]
        if any(item.get("country_code") == country_code for item in visited_list):
            return {"success": True, "message": f"{country_code} zaten ziyaret edilmiş", "countries": visited_list, "count": len(visited_list)}

        new_entry = {"country_code": country_code, "country_name": visit_data.country_name, "location": visit_data.location, "visited_at": visit_data.visited_at.isoformat() if visit_data.visited_at else datetime.utcnow().isoformat()}
        visited_list.append(new_entry)
        collection = DatabaseManager.get_collection(COLLECTIONS["users"])
        await collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"visited_countries": visited_list, "visited_countries_count": len(visited_list)}})
        xp_result = await award_xp_and_badges(user_id, 100)
        return {"success": True, "message": f"{country_code} eklendi! (Zınk!)", "countries": visited_list, "count": len(visited_list), "xp_result": xp_result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ülke eklenemedi: {str(e)}")


@router.delete("/api/v1/profile/visited-country", summary="Bir ülkeyi ziyaret listesinden kaldır")
async def remove_visited_country(
    country_code: str  = Query(..., min_length=2, max_length=3),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    try:
        country_code = country_code.upper()
        profile = await DatabaseManager.find_one(COLLECTIONS["users"], document_id=user_id)
        if not profile:
            return {"success": False, "message": "Kullanıcı bulunamadı", "countries": [], "count": 0}

        visited_countries = profile.get("visited_countries", [])
        new_list = [item for item in visited_countries if not ((isinstance(item, str) and item.upper() == country_code) or (isinstance(item, dict) and item.get("country_code", "").upper() == country_code))]
        if len(new_list) != len(visited_countries):
            collection = DatabaseManager.get_collection(COLLECTIONS["users"])
            await collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"visited_countries": new_list, "visited_countries_count": len(new_list)}})
        xp_result = await award_xp_and_badges(user_id, -100)
        return {"success": True, "message": f"{country_code} kaldırıldı", "countries": new_list, "count": len(new_list), "xp_result": xp_result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ülke kaldırılamadı: {str(e)}")


# ── Public Profile ────────────────────────────────────────────────────────────

@router.get("/api/v1/users/{user_id}/public-profile", summary="Bir kullanıcının halka açık profili")
async def get_public_profile(user_id: str = Path(...)):
    try:
        user = None
        if ObjectId.is_valid(user_id):
            user = await UserService.find_one(user_id=user_id)
        if not user:
            return {"user_id": user_id, "display_name": None, "bio": None, "visited_count": 0, "visited_countries": [], "passport_level": None, "found": False}
        visited = user.get("visited_countries", [])
        return {"user_id": user_id, "display_name": user.get("username") or user.get("display_name") or user.get("name"), "bio": user.get("bio"), "visited_count": len(visited), "visited_countries": visited[:10], "passport_level": user.get("passport_level", "Gezgin"), "found": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profil getirilemedi: {str(e)}")


# ── Profile Update ────────────────────────────────────────────────────────────

@router.patch("/api/v1/users/{user_id}/profile", summary="Kullanıcı profil bilgilerini güncelle")
async def update_user_profile(
    user_id: str = Path(...),
    data: UserProfileUpdate = None,
    current_user: dict = Depends(get_current_user),
):
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Geçersiz user_id")
        if current_user["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Sadece kendi profilinizi güncelleyebilirsiniz")
        update_fields = {k: v for k, v in data.dict().items() if v is not None}
        if not update_fields:
            return {"success": True, "message": "Güncellenecek alan yok"}
        collection = DatabaseManager.get_collection(COLLECTIONS["users"])
        result = await collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_fields})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        return {"success": True, "updated": list(update_fields.keys())}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profil güncellenemedi: {str(e)}")


# ── Gamification XP endpoint ──────────────────────────────────────────────────

@router.post("/api/v1/users/{user_id}/xp", tags=["Gamification"], summary="XP ekle / düş ve rozet kontrolü yap")
async def award_xp_endpoint(
    user_id:      str  = Path(...),
    delta:        int  = Query(..., description="Eklenecek veya düşülecek XP"),
    reason:       str  = Query("manual"),
    current_user: dict = Depends(get_current_user),
):
    if current_user["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Sadece kendi XP'nizi güncelleyebilirsiniz")
    result = await award_xp_and_badges(user_id, delta)
    if not result:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return {"success": True, "reason": reason, **result}


# ── Event Stamps ──────────────────────────────────────────────────────────────

@router.post("/api/v1/map/events/{event_id}/award-stamps", tags=["PAX Events"], summary="Etkinlik bittikten sonra katılımcılara damga ver")
async def award_event_stamps(
    event_id:     str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")
    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    if event.get("creator_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Sadece etkinlik sahibi damga verebilir")

    all_requests = await JoinRequestService.find_by_event(event_id)
    approved     = [r for r in all_requests if r.get("status") == "approved"]
    awarded      = []
    for req in approved:
        uid = req.get("user_id", "")
        if not uid:
            continue
        stamp_notif = NotificationCreate(user_id=uid, type=NotificationType.EVENT_STAMP, title="Etkinlik Damgası Kazandın! 🌟", body=f"'{event.get('title', 'Etkinlik')}' etkinliğine katıldığın için pasaportuna özel bir damga eklendi!", event_id=event_id, event_title=event.get("title"), read=False)
        await NotificationService.create(stamp_notif.model_dump())
        awarded.append(uid)
    return {"success": True, "message": f"{len(awarded)} katılımcıya damga bildirim gönderildi", "awarded_users": awarded}


# ── Notifications ─────────────────────────────────────────────────────────────

@router.get("/api/v1/users/{user_id}/notifications", tags=["PAX Events"], summary="Kullanıcının bildirimlerini getir")
async def get_notifications(
    user_id:     str  = Path(...),
    unread_only: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    if current_user["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Sadece kendi bildirimlerinizi görebilirsiniz")
    try:
        notifs = await NotificationService.find_by_user(user_id, unread_only=unread_only)
        unread = sum(1 for n in notifs if not n.get("read", False))
        return {"notifications": notifs, "total": len(notifs), "unread": unread}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bildirimler getirilemedi: {str(e)}")


@router.patch("/api/v1/users/{user_id}/notifications/read", tags=["PAX Events"], summary="Tüm bildirimleri okundu olarak işaretle")
async def mark_notifications_read(
    user_id: str = Path(...),
    current_user: dict = Depends(get_current_user),
):
    if current_user["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Sadece kendi bildirimlerinizi düzenleyebilirsiniz")
    try:
        await NotificationService.mark_all_read(user_id)
        return {"success": True, "message": "Tüm bildirimler okundu olarak işaretlendi"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"İşlem başarısız: {str(e)}")


# ── City Image Service ────────────────────────────────────────────────────────

_IMAGE_CACHE: Dict[str, str] = {}

_CITY_PHOTO_FALLBACKS: Dict[str, str] = {
    "paris": "photo-1499856871958-5b9627545d1a", "roma": "photo-1552832230-c0197dd311b5", "rome": "photo-1552832230-c0197dd311b5",
    "londra": "photo-1513635269975-59663e0ac1ad", "london": "photo-1513635269975-59663e0ac1ad",
    "barselona": "photo-1539037116277-4db20889f2d4", "barcelona": "photo-1539037116277-4db20889f2d4",
    "amsterdam": "photo-1534351590666-13e3e96b5017", "athens": "photo-1616489953121-042239c4ca94", "atina": "photo-1616489953121-042239c4ca94",
    "prag": "photo-1519677100203-a0e668c92439", "prague": "photo-1519677100203-a0e668c92439",
    "viyana": "photo-1516550893923-42d28e5677af", "vienna": "photo-1516550893923-42d28e5677af",
    "budapeşte": "photo-1506905925346-21bda4d32df4", "budapest": "photo-1506905925346-21bda4d32df4",
    "dubrovnik": "photo-1555990793-da11153b6ca8", "santorini": "photo-1570077188670-e3a8d69ac5ff",
    "lizbon": "photo-1555881400-74d7acaacd8b", "lisbon": "photo-1555881400-74d7acaacd8b",
    "madrid": "photo-1543783207-ec64e4d3c671", "floransa": "photo-1543429776-2782fc8e4e8a", "florence": "photo-1543429776-2782fc8e4e8a",
    "venedik": "photo-1534113414509-0eec2bfb493f", "venice": "photo-1534113414509-0eec2bfb493f",
    "berlin": "photo-1566404791232-af9fe0ae8f8b", "münih": "photo-1595867818082-083862f3d630", "munich": "photo-1595867818082-083862f3d630",
    "kopenhag": "photo-1513622470522-26c3c8a854bc", "copenhagen": "photo-1513622470522-26c3c8a854bc",
    "stockholm": "photo-1509356843151-3e7d96241e11", "zürich": "photo-1515488764276-beab7607c1e6", "zurich": "photo-1515488764276-beab7607c1e6",
    "edinburgh": "photo-1506377585622-bedcbb027afc", "dublin": "photo-1549918864-48ac978761a4",
    "brüksel": "photo-1559113202-c916b8e44373", "brussels": "photo-1559113202-c916b8e44373",
    "dubai": "photo-1512453979798-5ea904ac6605", "abu dabi": "photo-1533395427226-788cee21cc9e", "abu dhabi": "photo-1533395427226-788cee21cc9e",
    "doha": "photo-1547247153-08e0b79b0580", "kahire": "photo-1572252009286-268acec5ca0a", "cairo": "photo-1572252009286-268acec5ca0a",
    "marakeş": "photo-1489493887464-892be6d1daae", "marrakesh": "photo-1489493887464-892be6d1daae",
    "tokyo": "photo-1540959733332-eab4deabeeaf", "osaka": "photo-1589308078059-be1415eab4c3",
    "kyoto": "photo-1528360983277-13d401cdc186", "seul": "photo-1538485399081-7191377e8241", "seoul": "photo-1538485399081-7191377e8241",
    "bangkok": "photo-1508009603885-50cf7c579365", "singapur": "photo-1525625293386-3f8f99389edd", "singapore": "photo-1525625293386-3f8f99389edd",
    "bali": "photo-1537996194471-e657df975ab4", "hong kong": "photo-1536599018102-9f803c140fc1",
    "pekin": "photo-1508804185872-d7badad00f7d", "beijing": "photo-1508804185872-d7badad00f7d",
    "şanghay": "photo-1538428494232-9c0d8a3ab403", "shanghai": "photo-1538428494232-9c0d8a3ab403",
    "mumbai": "photo-1529253355930-ddbe423a2ac7", "delhi": "photo-1598394960038-f95c4ae36862",
    "istanbul": "photo-1524231757912-21f4fe3a7200", "kapadokya": "photo-1641128324972-af3208f0ddfa", "cappadocia": "photo-1641128324972-af3208f0ddfa",
    "antalya": "photo-1601596397527-37acf55a8d88", "bodrum": "photo-1601596397527-37acf55a8d88",
    "new york": "photo-1496442226666-8d4d0e62e6e9", "new york city": "photo-1496442226666-8d4d0e62e6e9", "nyc": "photo-1496442226666-8d4d0e62e6e9",
    "los angeles": "photo-1534190760961-74e8c1c5c3da", "miami": "photo-1506929562872-bb421503ef21",
    "new york": "photo-1496442226666-8d4d0e62e6e9",
    "sofya": "photo-1596621873816-7b5aca64c5b2", "sofia": "photo-1596621873816-7b5aca64c5b2",
    "bükreş": "photo-1584395630827-860eee694d7b", "bucharest": "photo-1584395630827-860eee694d7b",
    "belgrad": "photo-1566143945069-ea2e7e37e8c5", "saraybosna": "photo-1586183189334-a4a7f7a36969",
    "batum": "photo-1565008576549-57569a49371d", "tiflis": "photo-1565008576549-57569a49371d",
    "budva": "photo-1553899017-d6d8d60eaf14", "bakü": "photo-1547247153-08e0b79b0580",
    "tiran": "photo-1566143945069-ea2e7e37e8c5", "marakes": "photo-1489493887464-892be6d1daae",
    "_default": "photo-1476514525535-07fb3b4ae5f1",
}


def _build_unsplash_url(photo_id: str, width: int) -> str:
    return f"https://images.unsplash.com/{photo_id}?w={width}&q=75&auto=format&fit=crop"


def _city_slug(city: str) -> str:
    return city.split(",")[0].strip().lower()


def _ascii_query(text: str) -> str:
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if ord(c) < 128)


@router.get("/api/v1/image/city", tags=["Image Service"], summary="Şehir fotoğrafı URL'si döner")
async def get_city_image(
    q: str = Query(..., description="City name", min_length=1, max_length=100),
    w: int = Query(default=400, le=1200),
):
    import os
    slug      = _city_slug(q)
    cache_key = f"{slug}:{w}"

    if cache_key in _IMAGE_CACHE:
        return {"url": _IMAGE_CACHE[cache_key], "source": "cache"}

    api_key = os.getenv("UNSPLASH_ACCESS_KEY", "").strip('"').strip("'")
    if api_key and api_key != "your_unsplash_access_key_here":
        try:
            q_ascii      = _ascii_query(q)
            q_lower      = q.lower()
            is_food      = any(kw in q_lower for kw in ("food", "dish", "meal", "recipe"))
            words        = q_ascii.split()
            primary_q    = " ".join(words[:3]) if len(words) > 3 else q_ascii

            async with __import__("httpx").AsyncClient(timeout=6.0) as client:
                resp    = await client.get("https://api.unsplash.com/search/photos", params={"query": primary_q, "per_page": 1, "orientation": "landscape"}, headers={"Authorization": f"Client-ID {api_key}"})
                results = resp.json().get("results", []) if resp.status_code == 200 else []
                if not results:
                    if is_food:
                        food_words = [ww for ww in words if ww not in ("food", "dish", "meal", "recipe")]
                        fallback_q = " ".join(food_words[:2]) + " food" if food_words else "food photography"
                    else:
                        fallback_q = words[0] + " travel" if words else "travel"
                    resp2   = await client.get("https://api.unsplash.com/search/photos", params={"query": fallback_q, "per_page": 1, "orientation": "landscape"}, headers={"Authorization": f"Client-ID {api_key}"})
                    results = resp2.json().get("results", []) if resp2.status_code == 200 else []
                if results:
                    raw_url = results[0]["urls"]["regular"]
                    url     = raw_url.split("?")[0] + f"?w={w}&q=75&auto=format&fit=crop"
                    _IMAGE_CACHE[cache_key] = url
                    return {"url": url, "source": "unsplash_api"}
        except Exception:
            pass

    city_slug = slug.split()[0] if slug.split() else slug
    photo_id  = (_CITY_PHOTO_FALLBACKS.get(slug) or _CITY_PHOTO_FALLBACKS.get(city_slug) or _CITY_PHOTO_FALLBACKS.get("_default"))
    url       = _build_unsplash_url(photo_id, w)
    _IMAGE_CACHE[cache_key] = url
    return {"url": url, "source": "fallback"}
