"""
PLANİGO - Discovery Router
Keşfet ekranı endpoint'leri.
Extracted from main.py lines 193-826.
"""

import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query, status

from database import DatabaseManager, DealService, PinService, COLLECTIONS
from models import (
    DiscoveryDealCreate,
    DiscoveryDealResponse,
    DiscoveryDealInDB,
    DealCategory,
    MapPinResponse,
)
from services.travel_api import get_route_cheapest, _build_tp_link, get_city_image

router = APIRouter(prefix="/api/v1", tags=["Discovery"])

# ── Category list ─────────────────────────────────────────────────────────────

_DISCOVER_CATEGORIES: List[Dict[str, str]] = [
    {"id": "all",         "label": "Tüm Fırsatlar", "icon": "zap"},
    {"id": "vizesiz",     "label": "Vizesiz",        "icon": "shield-check"},
    {"id": "bütçe-dostu", "label": "Bütçe Dostu",   "icon": "wallet"},
    {"id": "hafta-sonu",  "label": "Hafta Sonu",     "icon": "sun"},
]

# ── Mock fallback data ────────────────────────────────────────────────────────

_MOCK_HERO: Dict[str, Any] = {
    "id": "mock-hero-atina",
    "city_name": "Atina", "country": "Yunanistan",
    "price": 1450, "original_price": 2100, "currency": "TRY",
    "nights": 3, "duration": "3 Gece • 4 Gün",
    "visa_free": True, "tags": ["Günün Fırsatı", "Vizesiz"],
    "image_url": "https://picsum.photos/seed/ATH/800/500",
    "airline": "Pegasus Airlines", "route": "IST → ATH", "discount_rate": 31,
    "remaining_hours": 8, "is_live": True, "source": "mock",
}

_MOCK_TRENDING: List[Dict[str, Any]] = [
    {"id": "t1", "location_name": "Dubai",     "cover_image_url": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=200", "view_count": 615000},
    {"id": "t2", "location_name": "Paris",     "cover_image_url": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=200", "view_count": 420000},
    {"id": "t3", "location_name": "Kapadokya", "cover_image_url": "https://images.unsplash.com/photo-1527838832700-5059252407fa?w=200", "view_count":  53000},
    {"id": "t4", "location_name": "Venedik",   "cover_image_url": "https://images.unsplash.com/photo-1534113414509-0eec2bfb493f?w=200", "view_count": 310000},
]

_MOCK_DEALS: List[Dict[str, Any]] = [
    {"id": "m1", "city_name": "Atina",      "country": "Yunanistan",    "price": 1450,  "currency": "TRY", "duration": "3 Gece", "flight_time": "1sa 20dk", "visa_free": True,  "tags": ["Vizesiz"],                   "filter_tags": ["vizesiz", "bütçe-dostu"], "image_url": "https://images.unsplash.com/photo-1555993539-1732b0258235?w=400", "rating": 4.6},
    {"id": "m2", "city_name": "Tokyo",      "country": "Japonya",        "price": 24900, "currency": "TRY", "duration": "7 Gece", "flight_time": "11sa 30dk","visa_free": False, "tags": ["Son 2 Koltuk"],               "filter_tags": ["hafta-sonu"],             "image_url": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400", "rating": 4.8},
    {"id": "m3", "city_name": "Saraybosna", "country": "Bosna-Hersek",   "price": 3100,  "currency": "TRY", "duration": "4 Gece", "flight_time": "1sa 30dk", "visa_free": True,  "tags": ["Vizesiz"],                   "filter_tags": ["vizesiz", "hafta-sonu"],  "image_url": "https://images.unsplash.com/photo-1586183189334-a4a7f7a36969?w=400", "rating": 4.8},
    {"id": "m4", "city_name": "Tiflis",     "country": "Gürcistan",      "price": 2800,  "currency": "TRY", "duration": "5 Gece", "flight_time": "2sa 00dk", "visa_free": True,  "tags": ["Vizesiz", "%15 İndirim"],    "filter_tags": ["vizesiz", "bütçe-dostu"],"image_url": "https://images.unsplash.com/photo-1565008576549-57569a49371d?w=400", "rating": 4.7},
    {"id": "m5", "city_name": "Bali",       "country": "Endonezya",      "price": 18500, "currency": "TRY", "duration": "6 Gece", "flight_time": "9sa 00dk", "visa_free": True,  "tags": ["Vizesiz", "Hafta Sonu"],     "filter_tags": ["vizesiz", "hafta-sonu"],  "image_url": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400", "rating": 4.9},
]

_MOCK_VIZESIZ: List[Dict[str, Any]] = [
    {"id": "vz1", "city": "Batum",      "country": "Gürcistan",    "country_code": "GE", "price": 1400, "currency": "TRY", "nights": 3, "flight_duration": "1sa 10dk", "image_url": "https://images.unsplash.com/photo-1565008576549-57569a49371d?w=800&q=80", "is_visa_free": True, "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTBUS1?marker=710551"},
    {"id": "vz2", "city": "Belgrad",    "country": "Sırbistan",    "country_code": "RS", "price": 1850, "currency": "TRY", "nights": 3, "flight_duration": "1sa 30dk", "image_url": "https://images.unsplash.com/photo-1566143945069-ea2e7e37e8c5?w=800&q=80", "is_visa_free": True, "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTBEG1?marker=710551"},
    {"id": "vz3", "city": "Saraybosna", "country": "Bosna-Hersek", "country_code": "BA", "price": 2100, "currency": "TRY", "nights": 4, "flight_duration": "1sa 45dk", "image_url": "https://images.unsplash.com/photo-1586183189334-a4a7f7a36969?w=800&q=80", "is_visa_free": True, "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTSJJ1?marker=710551"},
    {"id": "vz4", "city": "Budva",      "country": "Karadağ",      "country_code": "ME", "price": 3200, "currency": "TRY", "nights": 5, "flight_duration": "1sa 50dk", "image_url": "https://images.unsplash.com/photo-1553899017-d6d8d60eaf14?w=800&q=80", "is_visa_free": True, "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTTGD1?marker=710551"},
    {"id": "vz5", "city": "Tiflis",     "country": "Gürcistan",    "country_code": "GE", "price": 2800, "currency": "TRY", "nights": 5, "flight_duration": "2sa 00dk", "image_url": "https://images.unsplash.com/photo-1565008576549-57569a49371d?w=800&q=80", "is_visa_free": True, "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTTBS1?marker=710551"},
    {"id": "vz6", "city": "Marakeş",    "country": "Fas",          "country_code": "MA", "price": 4200, "currency": "TRY", "nights": 4, "flight_duration": "3sa 30dk", "image_url": "https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=800&q=80", "is_visa_free": True, "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTRAK1?marker=710551"},
]

_MOCK_BUDGET_FRIENDLY: List[Dict[str, Any]] = [
    {"id": "bd1", "city": "Sofya",     "country": "Bulgaristan", "country_code": "BG", "price": 1100, "currency": "TRY", "nights": 2, "flight_duration": "1sa 15dk", "discount_badge": 32, "seats_left": None, "image_url": "https://images.unsplash.com/photo-1596621873816-7b5aca64c5b2?w=800&q=80", "is_visa_free": False, "visa_note": None, "affiliate_url": "https://www.aviasales.com/search/ISTSOF1?marker=710551"},
    {"id": "bd2", "city": "Atina",     "country": "Yunanistan",  "country_code": "GR", "price": 1450, "currency": "TRY", "nights": 2, "flight_duration": "1sa 20dk", "discount_badge": 24, "seats_left": None, "image_url": "https://images.unsplash.com/photo-1616489953121-042239c4ca94?w=800&q=80", "is_visa_free": True,  "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTATH1?marker=710551"},
    {"id": "bd3", "city": "Belgrad",   "country": "Sırbistan",   "country_code": "RS", "price": 1850, "currency": "TRY", "nights": 3, "flight_duration": "1sa 45dk", "discount_badge": 18, "seats_left": None, "image_url": "https://images.unsplash.com/photo-1566143945069-ea2e7e37e8c5?w=800&q=80", "is_visa_free": True,  "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTBEG1?marker=710551"},
    {"id": "bd4", "city": "Bükreş",    "country": "Romanya",     "country_code": "RO", "price": 2200, "currency": "TRY", "nights": 2, "flight_duration": "1sa 45dk", "discount_badge": None,"seats_left": 3,    "image_url": "https://images.unsplash.com/photo-1584395630827-860eee694d7b?w=800&q=80", "is_visa_free": False, "visa_note": None, "affiliate_url": "https://www.aviasales.com/search/ISTOTP1?marker=710551"},
    {"id": "bd5", "city": "Tiran",     "country": "Arnavutluk",  "country_code": "AL", "price": 2800, "currency": "TRY", "nights": 3, "flight_duration": "2sa 00dk", "discount_badge": None,"seats_left": 4,    "image_url": "https://images.unsplash.com/photo-1566143945069-ea2e7e37e8c5?w=800&q=80", "is_visa_free": True,  "visa_note": "Vize gerekmez", "affiliate_url": "https://www.aviasales.com/search/ISTTIA1?marker=710551"},
    {"id": "bd6", "city": "Budapeşte", "country": "Macaristan",  "country_code": "HU", "price": 4800, "currency": "TRY", "nights": 3, "flight_duration": "2sa 30dk", "discount_badge": 10, "seats_left": None, "image_url": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80", "is_visa_free": False, "visa_note": None, "affiliate_url": "https://www.aviasales.com/search/ISTBUD1?marker=710551"},
]

BUDGET_MAX_PRICE: int = 5_000

# IATA kodu → Türkçe şehir adı (wishlist destination alanı bazen IATA kodu içerir)
_IATA_TO_CITY: dict = {
    "IST": "İstanbul", "SAW": "İstanbul", "ADB": "İzmir", "AYT": "Antalya",
    "ESB": "Ankara",   "TZX": "Trabzon",  "DLM": "Dalaman", "BJV": "Bodrum",
    "CDG": "Paris",    "ORY": "Paris",    "LGW": "Londra",  "LHR": "Londra",
    "STN": "Londra",   "AMS": "Amsterdam","FCO": "Roma",    "MXP": "Milano",
    "BCN": "Barselona","MAD": "Madrid",   "ATH": "Atina",   "SOF": "Sofya",
    "BEG": "Belgrad",  "TBS": "Tiflis",   "SJJ": "Saraybosna", "DXB": "Dubai",
    "CMN": "Kazablanka","RAK": "Marakeş", "SKP": "Üsküp",   "OHD": "Ohrid",
    "TIV": "Tivat",    "BRU": "Brüksel",  "CRL": "Brüksel", "FRA": "Frankfurt",
    "MUC": "Münih",    "VIE": "Viyana",   "PRG": "Prag",    "BUD": "Budapeşte",
    "WAW": "Varşova",  "OTP": "Bükreş",   "TIA": "Tiran",   "TGD": "Podgorica",
    "SVQ": "Sevilla",  "LIS": "Lizbon",   "PMI": "Palma",   "DBV": "Dubrovnik",
    "SPU": "Split",    "ZAG": "Zagreb",   "LJU": "Ljubljana",
}

# ── Live discovery: 10 popüler rota ──────────────────────────────────────────
#  (origin, dest, city, country, flag, is_visa_free, flight_dur, nights)
_POPULAR_ROUTES = [
    ("IST", "TBS", "Tiflis",     "Gürcistan",    "🇬🇪", True,  "1s 45dk", 3),
    ("IST", "BEG", "Belgrad",    "Sırbistan",    "🇷🇸", True,  "2s 10dk", 3),
    ("IST", "SJJ", "Saraybosna", "Bosna Hersek", "🇧🇦", True,  "2s 00dk", 3),
    ("IST", "TIV", "Tivat",      "Karadağ",      "🇲🇪", True,  "1s 55dk", 4),
    ("IST", "SOF", "Sofya",      "Bulgaristan",  "🇧🇬", True,  "1s 10dk", 2),
    ("IST", "ATH", "Atina",      "Yunanistan",   "🇬🇷", True,  "1s 20dk", 3),
    ("IST", "SKP", "Üsküp",      "K.Makedonya",  "🇲🇰", True,  "1s 30dk", 3),
    ("IST", "OHD", "Ohrid",      "K.Makedonya",  "🇲🇰", True,  "1s 25dk", 3),
    ("IST", "DXB", "Dubai",      "BAE",          "🇦🇪", False, "3s 30dk", 4),
    ("IST", "CMN", "Kazablanka", "Fas",          "🇲🇦", True,  "5s 10dk", 4),
]

# Ortak cache — tüm endpoint'ler buradan okur, 8 saatte bir yenilenir
_DISCOVERY_CACHE: dict = {}   # "all" -> (timestamp, sorted_routes)
_DISCOVERY_CACHE_TTL = 8 * 3600

# Vizesiz ve bütçe bölümleri için ayrı cache — 4 saatte bir yenilenir
_VIZESIZ_CACHE: dict = {}
_BUDGET_CACHE:  dict = {}
_SECTION_CACHE_TTL = 4 * 3600


async def _load_from_wishlists() -> list:
    """
    scrape_status=ready olan planlardaki gerçek uçuş fiyatlarından rota listesi üretir.
    Her destinasyon için yalnızca en ucuz kayıt alınır.
    """
    try:
        wishlists = await DatabaseManager.find_all(
            "wishlists",
            query={"scrape_status": "ready", "trip_details": {"$exists": True}},
            limit=100,
            sort_by="updated_at", sort_order=-1,
        )
    except Exception:
        return []

    # IATA kodu → _POPULAR_ROUTES metadata eşlemesi
    _routes_by_dest = {
        d: (o, city, country, flag, visa, dur, nights)
        for o, d, city, country, flag, visa, dur, nights in
        [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]) for r in _POPULAR_ROUTES]
    }

    seen: set = set()
    routes = []
    for w in wishlists:
        td  = w.get("trip_details") or {}
        ob  = td.get("outbound_flight") or {}
        price = float(ob.get("price") or w.get("current_price") or 0)
        if price <= 0:
            continue
        dest = ob.get("arrival_code") or ""
        if not dest or dest in seen:
            continue
        seen.add(dest)

        meta = _routes_by_dest.get(dest)
        if meta:
            o_code, city, country, flag, visa, dur, nights = meta
        else:
            o_code   = ob.get("departure_code", "IST")
            raw_dest = w.get("destination") or dest
            # IATA kodu gelirse Türkçe şehir adına çevir
            city     = _IATA_TO_CITY.get(raw_dest, raw_dest)
            country  = w.get("destination_country", "")
            flag, visa, dur = "🌍", False, ob.get("duration", "")
            nights   = int(td.get("nights") or 3)

        dep_date = (ob.get("departure_time") or "")[:10]
        routes.append({
            "price":           price,
            "city":            city,
            "country":         country,
            "flag":            flag,
            "origin":          o_code,
            "dest":            dest,
            "airline":         ob.get("airline", ""),
            "depart_date":     dep_date,
            "is_visa_free":    visa,
            "flight_duration": dur,
            "nights":          nights,
            "affiliate_url":   _build_tp_link(o_code, dest, dep_date) if dep_date else None,
            "image_url":       f"https://picsum.photos/seed/{dest}/800/500",
            "source":          "wishlist",
        })
    return routes


async def _load_discovery_data() -> list:
    """
    Önce Travelpayouts API'yi dener (8 saat cache'li).
    Yeterli veri gelmezse wishlists collection'ından gerçek uçuş fiyatlarını kullanır.
    """
    now = datetime.utcnow().timestamp()
    cached = _DISCOVERY_CACHE.get("all")
    if cached:
        ts, data = cached
        if now - ts < _DISCOVERY_CACHE_TTL:
            return data

    # 1. Travelpayouts
    tasks = [get_route_cheapest(o, d) for o, d, *_ in _POPULAR_ROUTES]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    routes = []
    for i, r in enumerate(results):
        if isinstance(r, Exception) or r is None or not r.get("price"):
            continue
        o, d, city, country, flag, visa_free, dur, nights = _POPULAR_ROUTES[i]
        dep = (r["depart_date"] or "")[:10]
        routes.append({
            "price":           r["price"],
            "city":            city,
            "country":         country,
            "flag":            flag,
            "origin":          o,
            "dest":            d,
            "airline":         r.get("airline", ""),
            "depart_date":     dep,
            "is_visa_free":    visa_free,
            "flight_duration": dur,
            "nights":          nights,
            "affiliate_url":   r.get("link") or _build_tp_link(o, d, dep),
            "image_url":       f"https://picsum.photos/seed/{d}/800/500",
            "source":          "kiwi" if r.get("link") else "travelpayouts",
        })

    # 2. Wishlist fallback — Travelpayouts yetersizse
    if len(routes) < 3:
        wl_routes = await _load_from_wishlists()
        existing_dests = {r["dest"] for r in routes}
        for r in wl_routes:
            if r["dest"] not in existing_dests:
                routes.append(r)
                existing_dests.add(r["dest"])

    routes.sort(key=lambda x: x["price"])
    if routes:
        img_results = await asyncio.gather(
            *[get_city_image(r["dest"]) for r in routes],
            return_exceptions=True
        )
        for i, img in enumerate(img_results):
            if isinstance(img, str):
                routes[i]["image_url"] = img
        _DISCOVERY_CACHE["all"] = (now, routes)
    return routes


async def _load_vizesiz_routes() -> list:
    """
    1. Travelpayouts'a cari ay vizesiz rotaları sorgular.
    2. Fiyat gelmezse wishlists'ten visa_free destinasyonları kullanır.
    4 saat cache'li. Mock fallback yok.
    """
    now = datetime.utcnow().timestamp()
    cached = _VIZESIZ_CACHE.get("vizesiz")
    if cached:
        ts, data = cached
        if now - ts < _SECTION_CACHE_TTL:
            return data

    # 1. Travelpayouts
    depart_at = datetime.utcnow().strftime("%Y-%m")
    vf_meta = [
        (o, d, city, country, flag, dur, nights)
        for o, d, city, country, flag, visa, dur, nights in _POPULAR_ROUTES
        if visa
    ]
    tasks = [get_route_cheapest(o, d, depart_at) for o, d, *_ in vf_meta]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    routes = []
    for i, r in enumerate(results):
        if isinstance(r, Exception) or r is None or not r.get("price"):
            continue
        o, d, city, country, flag, dur, nights = vf_meta[i]
        dep = (r["depart_date"] or "")[:10]
        routes.append({
            "id":              f"vf-{d.lower()}",
            "city":            city,
            "country":         country,
            "price":           r["price"],
            "currency":        "TRY",
            "price_label":     "başlayan fiyatlarla",
            "nights":          nights,
            "flight_duration": dur,
            "is_visa_free":    True,
            "visa_note":       "Vize gerekmez",
            "image_url":       f"https://picsum.photos/seed/{d}/800/500",
            "affiliate_url":   r.get("link") or _build_tp_link(o, d, dep),
        })

    # 2. Travelpayouts yetersizse wishlist'ten visa_free filtrele
    if not routes:
        _visa_free_codes = {d for _, d, _, _, _, visa, _, _ in _POPULAR_ROUTES if visa}
        wl = await _load_from_wishlists()
        for r in wl:
            if r.get("is_visa_free") or r["dest"] in _visa_free_codes:
                routes.append({
                    "id":              f"vf-{r['dest'].lower()}",
                    "city":            r["city"],
                    "country":         r["country"],
                    "price":           r["price"],
                    "currency":        "TRY",
                    "price_label":     "başlayan fiyatlarla",
                    "nights":          r["nights"],
                    "flight_duration": r["flight_duration"],
                    "is_visa_free":    True,
                    "visa_note":       "Vize gerekmez",
                    "image_url":       r["image_url"],
                    "affiliate_url":   r["affiliate_url"],
                })

    routes.sort(key=lambda x: x["price"])
    if routes:
        img_results = await asyncio.gather(
            *[get_city_image(r["id"].replace("vf-", "").upper()) for r in routes],
            return_exceptions=True
        )
        for i, img in enumerate(img_results):
            if isinstance(img, str):
                routes[i]["image_url"] = img
        _VIZESIZ_CACHE["vizesiz"] = (now, routes)
    return routes


async def _load_budget_popular_routes(top_n: int = 5) -> list:
    """
    1. Travelpayouts'a cari ay 10 popüler rotayı sorgular, en ucuz top_n'i döner.
    2. Fiyat gelmezse wishlists'ten top_n alır.
    4 saat cache'li. Mock fallback yok.
    """
    now = datetime.utcnow().timestamp()
    cached = _BUDGET_CACHE.get("budget")
    if cached:
        ts, data = cached
        if now - ts < _SECTION_CACHE_TTL:
            return data

    # 1. Travelpayouts
    depart_at = datetime.utcnow().strftime("%Y-%m")
    tasks = [get_route_cheapest(o, d, depart_at) for o, d, *_ in _POPULAR_ROUTES]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    routes = []
    for i, r in enumerate(results):
        if isinstance(r, Exception) or r is None or not r.get("price"):
            continue
        o, d, city, country, flag, visa_free, dur, nights = _POPULAR_ROUTES[i]
        dep = (r["depart_date"] or "")[:10]
        routes.append({
            "id":              f"bf-{d.lower()}",
            "city":            city,
            "country":         country,
            "price":           r["price"],
            "currency":        "TRY",
            "price_label":     "başlayan fiyatlarla",
            "nights":          nights,
            "flight_duration": dur,
            "is_visa_free":    visa_free,
            "image_url":       f"https://picsum.photos/seed/{d}/800/500",
            "affiliate_url":   r.get("link") or _build_tp_link(o, d, dep),
            "discount_badge":  None,
            "seats_left":      None,
        })

    # 2. Travelpayouts yetersizse wishlist'ten al
    if len(routes) < top_n:
        wl = await _load_from_wishlists()
        existing = {r["dest"] for r in routes}
        for r in wl:
            if r["dest"] not in existing:
                routes.append({
                    "id":              f"bf-{r['dest'].lower()}",
                    "city":            r["city"],
                    "country":         r["country"],
                    "price":           r["price"],
                    "currency":        "TRY",
                    "price_label":     "başlayan fiyatlarla",
                    "nights":          r["nights"],
                    "flight_duration": r["flight_duration"],
                    "is_visa_free":    r["is_visa_free"],
                    "image_url":       r["image_url"],
                    "affiliate_url":   r["affiliate_url"],
                    "discount_badge":  None,
                    "seats_left":      None,
                })
                existing.add(r["dest"])

    routes.sort(key=lambda x: x["price"])
    top = routes[:top_n]
    if top:
        img_results = await asyncio.gather(
            *[get_city_image(r["id"].replace("bf-", "").upper()) for r in top],
            return_exceptions=True
        )
        for i, img in enumerate(img_results):
            if isinstance(img, str):
                top[i]["image_url"] = img
        _BUDGET_CACHE["budget"] = (now, top)
    return top


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/discovery", response_model=List[DiscoveryDealResponse], summary="Keşfet ekranını besler")
async def get_discovery_deals(
    category: Optional[DealCategory] = None,
    featured_only: bool = False,
    limit: int = Query(default=20, le=100),
    skip: int = Query(default=0, ge=0),
):
    try:
        query = {}
        if category:
            query["category"] = category.value
        if featured_only:
            query["is_featured"] = True
        deals = await DealService.find_all(query, skip, limit)
        return [DiscoveryDealResponse(**deal) for deal in deals]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri getirme hatası: {str(e)}")


@router.get("/discovery/full", summary="Keşfet ekranının tamamını tek JSON olarak döner")
async def get_discovery_full_screen(
    filter_type: Optional[str] = Query(None, description="visa_free | under_5k | all"),
):
    try:
        visa_free_filter = filter_type == "visa_free"
        under_5k_filter  = filter_type == "under_5k"

        deal_of_day = await DatabaseManager.find_all("deal_of_day", limit=1)
        deal_of_day_data = deal_of_day[0] if deal_of_day else None
        if deal_of_day_data and "valid_until" in deal_of_day_data:
            valid_until = deal_of_day_data.get("valid_until")
            if isinstance(valid_until, datetime):
                remaining = valid_until - datetime.utcnow()
                deal_of_day_data["remaining_days"]  = max(0, remaining.days)
                deal_of_day_data["remaining_hours"] = max(0, remaining.seconds // 3600)
                deal_of_day_data["is_live"]         = remaining.total_seconds() > 0

        viral_pins = await PinService.find_all({"is_viral": True}, limit=10)
        if viral_pins:
            viral_stories = [
                {
                    "_id": str(pin["_id"]),
                    "location_name":   pin["title"],
                    "cover_image_url": pin["image_url"] or "https://images.unsplash.com/photo-1542259681-dadcd73156f0?w=200",
                    "story_slides": [],
                    "view_count": pin.get("friends_visited", 0) * 100 + 500,
                    "is_viral": True,
                }
                for pin in viral_pins
            ]
        else:
            viral_stories = await DatabaseManager.find_all("viral_stories", limit=10, sort_by="view_count", sort_order=-1)

        escapes_query = {}
        if visa_free_filter:
            escapes_query["is_visa_free"] = True
        if under_5k_filter:
            escapes_query["starting_price"] = {"$lt": 5000}

        budget_escapes = await DatabaseManager.find_all("budget_escapes", query=escapes_query, limit=6, sort_by="starting_price", sort_order=1)

        gems_query = {}
        if under_5k_filter:
            gems_query["price"] = {"$lt": 5000}

        visa_free_gems = await DatabaseManager.find_all("visa_free_gems", query=gems_query, limit=10, sort_by="price", sort_order=1)

        featured_query: Dict[str, Any] = {"is_featured": True}
        if under_5k_filter:
            featured_query["price"] = {"$lt": 5000}

        featured_deals = await DealService.find_all(featured_query, limit=5)

        return {
            "deal_of_the_day": deal_of_day_data,
            "viral_stories":   viral_stories,
            "budget_escapes":  budget_escapes,
            "visa_free_gems":  visa_free_gems,
            "featured_deals":  featured_deals,
            "timestamp":       datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Discovery verisi getirilemedi: {str(e)}")


@router.post("/discovery", response_model=DiscoveryDealResponse, status_code=201, summary="Yeni fırsat ekle")
async def create_discovery_deal(deal: DiscoveryDealCreate):
    try:
        deal_db  = DiscoveryDealInDB(**deal.model_dump())
        document = deal_db.to_dict()
        deal_id  = await DatabaseManager.insert_one(COLLECTIONS["deals"], document)
        if not deal_id:
            raise HTTPException(status_code=500, detail="Fırsat oluşturulamadı")
        created = await DealService.find_one(deal_id)
        return DiscoveryDealResponse(**created)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veritabanı hatası: {str(e)}")


@router.get("/discover/categories", tags=["Discover v2"], summary="Filtre kategorilerini döner")
async def get_discover_categories():
    return {"categories": _DISCOVER_CATEGORIES}


@router.get("/discover/hero", tags=["Discover v2"], summary="Günün Fırsatı hero kartını döner")
async def get_discover_hero():
    routes = await _load_discovery_data()
    if not routes:
        return _MOCK_HERO

    best = routes[0]
    orig_price = int(best["price"] * 1.35)
    disc = round((1 - best["price"] / orig_price) * 100)
    return {
        "id":               f"live-{best['dest'].lower()}",
        "city_name":        best["city"],
        "country":          best["country"],
        "route":            f"{best['origin']} → {best['dest']}",
        "airline":          best["airline"],
        "discount_rate":    disc,
        "original_price":   orig_price,
        "discounted_price": best["price"],
        "currency":         "TRY",
        "price_label":      "başlayan fiyatlarla",
        "nights":           best["nights"],
        "duration":         f"{best['nights']} Gece • {best['nights'] + 1} Gün",
        "is_visa_free":     best["is_visa_free"],
        "visa_free":        best["is_visa_free"],
        "image_url":        best["image_url"],
        "affiliate_url":    best["affiliate_url"],
        "is_live":          True,
        "remaining_hours":  8,
        "tags":             ["Günün Fırsatı"],
    }


@router.get("/discover/trending", tags=["Discover v2"], summary="Viral pin hikayelerini döner")
async def get_discover_trending(limit: int = Query(default=6, le=20)):
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
        static = await DatabaseManager.find_all("viral_stories", limit=limit, sort_by="view_count", sort_order=-1)
        if static:
            return {"stories": static}
    except Exception:
        pass
    return {"stories": _MOCK_TRENDING}


@router.get("/discover/deals", tags=["Discover v2"], summary="Fırsat listesini döner (kategori filtreli)")
async def get_discover_deals(
    category: Optional[str] = Query(None, description="vizesiz | bütçe-dostu | all"),
    limit:    int            = Query(default=10, le=50),
):
    routes = await _load_discovery_data()
    if len(routes) < 2:
        mock = _MOCK_DEALS
        if category and category != "all":
            mock = [d for d in _MOCK_DEALS if category in d.get("filter_tags", [])]
        return {"deals": mock[:limit], "source": "mock"}

    # Hero = routes[0]; kaçamaklar = 2., 3., 4. (index 1-3)
    pool = routes[1:]
    if category == "visa_free" or category == "vizesiz":
        pool = [r for r in pool if r["is_visa_free"]]
    elif category == "under_5k" or category == "bütçe-dostu":
        pool = [r for r in pool if r["price"] < 5000]

    escapes = pool[:3]
    deals = [{
        "id":              f"deal-{r['dest'].lower()}",
        "city_name":       r["city"],
        "city":            r["city"],
        "country":         r["country"],
        "price":           r["price"],
        "currency":        "TRY",
        "price_label":     "başlayan fiyatlarla",
        "duration":        f"{r['nights']} Gece",
        "flight_time":     r["flight_duration"],
        "is_visa_free":    r["is_visa_free"],
        "visa_free":       r["is_visa_free"],
        "tags":            ["Vizesiz ✓"] if r["is_visa_free"] else [],
        "filter_tags":     (["vizesiz"] if r["is_visa_free"] else []) + (["bütçe-dostu"] if r["price"] < 5000 else []),
        "image_url":       r["image_url"],
        "affiliate_url":   r["affiliate_url"],
    } for r in escapes]

    return {"deals": deals, "source": "live"}


@router.get("/discover/budget-friendly", tags=["Discover v2"], summary="Bütçe dostu rotalar — popüler 10 şehirden en ucuz 5")
async def get_budget_friendly_routes(
    limit:     int = Query(default=5, le=50),
    max_price: int = Query(default=BUDGET_MAX_PRICE, le=50_000),
):
    routes = await _load_budget_popular_routes(top_n=5)
    filtered = [r for r in routes if r["price"] <= max_price]
    return {"routes": filtered[:limit], "source": "live", "count": len(filtered), "max_price": max_price}


@router.get("/discover/vizesiz", tags=["Discover v2"], summary="Vizesiz rotaları döner (Türk pasaportu) — cari ay fiyatı")
async def get_vizesiz_routes(limit: int = Query(default=10, le=50)):
    routes = await _load_vizesiz_routes()
    return {"routes": routes[:limit], "source": "live", "count": len(routes)}
