"""
PAX Travel API Service — Faz 1
Ucus: Travelpayouts Aviasales API (token ile)
Otel: Booking.com via RapidAPI (Adim 3)
Monetizasyon: Travelpayouts affiliate linkleri (Marker: 710551)
Cache: 4 saatlik TTL
"""
import os
import re as _re
import logging
from contextlib import asynccontextmanager
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
_RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
_KIWI_HOST    = os.getenv("KIWI_HOST", "")
_BOOKING_HOST = os.getenv("BOOKING_HOST", "")
_TP_TOKEN     = os.getenv("TRAVELPAYOUTS_TOKEN", "")
_TP_MARKER    = os.getenv("TRAVELPAYOUTS_MARKER", "710551")

_TIMEOUT            = httpx.Timeout(20.0, connect=8.0)
_DISCOVERY_TIMEOUT  = httpx.Timeout(6.0,  connect=4.0)   # Discovery cold-start için
_CACHE_TTL = 4 * 3600   # 4 saat (saniye)
_USD_RATE  = 45.0       # 1 USD = 45 TRY (sabit kur)

# Travelpayouts Aviasales endpoint
_TP_PRICES_URL = "https://api.travelpayouts.com/aviasales/v3/get_latest_prices"

# Affiliate search link template (kullanici tikladiginda acilir)
_TP_SEARCH_URL = "https://www.aviasales.com/search/{origin}{day}{mon}{dest}1"
_TP_MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]

# Kiwi.com city-country slug mapping (IATA -> kiwi URL slug)
_IATA_TO_KIWI_SLUG = {
    "IST": "istanbul-turkey",    "SAW": "istanbul-turkey",
    "ESB": "ankara-turkey",      "ADB": "izmir-turkey",
    "TZX": "trabzon-turkey",     "AYT": "antalya-turkey",
    "LHR": "london-united-kingdom", "LGW": "london-united-kingdom",
    "STN": "london-united-kingdom", "LTN": "london-united-kingdom",
    "CDG": "paris-france",       "ORY": "paris-france",
    "BEG": "belgrade-serbia",    "ATH": "athens-greece",
    "SOF": "sofia-bulgaria",     "SKP": "skopje-north-macedonia",
    "SJJ": "sarajevo-bosnia-and-herzegovina",
    "TIV": "tivat-montenegro",   "TBS": "tbilisi-georgia",
    "DXB": "dubai-united-arab-emirates",
    "CMN": "casablanca-morocco", "FCO": "rome-italy",
    "MAD": "madrid-spain",       "CRL": "brussels-belgium",
    "BRU": "brussels-belgium",   "OHD": "ohrid-north-macedonia",
    "AMS": "amsterdam-netherlands", "MUC": "munich-germany",
    "VIE": "vienna-austria",     "BCN": "barcelona-spain",
    "PRG": "prague-czechia",     "BUD": "budapest-hungary",
    "WAW": "warsaw-poland",      "FCO": "rome-italy",
    "NAP": "naples-italy",       "MXP": "milan-italy",
    "ZRH": "zurich-switzerland", "GVA": "geneva-switzerland",
    "CPH": "copenhagen-denmark", "ARN": "stockholm-sweden",
    "OSL": "oslo-norway",        "HEL": "helsinki-finland",
    "OTP": "bucharest-romania",  "KBP": "kyiv-ukraine",
    "GYD": "baku-azerbaijan",    "EVN": "yerevan-armenia",
    "NQZ": "nur-sultan-kazakhstan",
}

# ── Unsplash image cache ───────────────────────────────────────────────────────
_UNSPLASH_KEY      = os.getenv("UNSPLASH_ACCESS_KEY", "")
_unsplash_cache: dict = {}          # iata -> (timestamp, url)
_UNSPLASH_CACHE_TTL = 24 * 3600    # 24 saat

_IATA_TO_EN_CITY = {
    "TBS": "Tbilisi Georgia",       "BEG": "Belgrade Serbia",
    "SJJ": "Sarajevo Bosnia",       "TIV": "Tivat Montenegro",
    "SOF": "Sofia Bulgaria",        "ATH": "Athens Greece",
    "SKP": "Skopje Macedonia",      "OHD": "Ohrid Lake Macedonia",
    "DXB": "Dubai",                 "CMN": "Casablanca Morocco",
    "IST": "Istanbul Turkey",       "CDG": "Paris France",
    "LHR": "London",                "AMS": "Amsterdam",
    "FCO": "Rome Italy",            "BCN": "Barcelona Spain",
    "MAD": "Madrid Spain",          "BUD": "Budapest Hungary",
    "PRG": "Prague",                "VIE": "Vienna Austria",
    "MUC": "Munich Germany",        "WAW": "Warsaw Poland",
    "OTP": "Bucharest Romania",     "TIA": "Tirana Albania",
    "TGD": "Podgorica Montenegro",  "KBP": "Kyiv Ukraine",
    "GYD": "Baku Azerbaijan",       "EVN": "Yerevan Armenia",
    "AYT": "Antalya Turkey",        "ESB": "Ankara Turkey",
    "ADB": "Izmir Turkey",          "TZX": "Trabzon Turkey",
    "SAW": "Istanbul Turkey",       "BRU": "Brussels Belgium",
    "CRL": "Brussels Belgium",      "ZRH": "Zurich Switzerland",
    "CPH": "Copenhagen Denmark",    "ARN": "Stockholm Sweden",
    "RAK": "Marrakech Morocco",
}

# IATA → Wikipedia sayfa başlığı (İngilizce, şehir fotoğrafı için)
_IATA_TO_WIKI_TITLE: dict = {
    "TBS": "Tbilisi",        "BEG": "Belgrade",
    "SJJ": "Sarajevo",       "TIV": "Tivat",
    "TGD": "Podgorica",      "SOF": "Sofia",
    "ATH": "Athens",         "SKP": "Skopje",
    "OHD": "Ohrid",          "DXB": "Dubai",
    "CMN": "Casablanca",     "RAK": "Marrakesh",
    "IST": "Istanbul",       "SAW": "Istanbul",
    "LHR": "London",         "LGW": "London",
    "STN": "London",         "CDG": "Paris",
    "ORY": "Paris",          "FCO": "Rome",
    "AMS": "Amsterdam",      "BUD": "Budapest",
    "PRG": "Prague",         "VIE": "Vienna",
    "BCN": "Barcelona",      "MAD": "Madrid",
    "BRU": "Brussels",       "CRL": "Brussels",
    "MUC": "Munich",         "WAW": "Warsaw",
    "OTP": "Bucharest",      "TIA": "Tirana",
    "GYD": "Baku",           "EVN": "Yerevan",
    "AYT": "Antalya",        "ESB": "Ankara",
    "ADB": "Izmir",          "TZX": "Trabzon",
    "ZRH": "Zurich",         "CPH": "Copenhagen",
}

# ── Startup Validation ────────────────────────────────────────────────────────
def _validate_config() -> bool:
    missing = []
    if not _TP_TOKEN:
        missing.append("TRAVELPAYOUTS_TOKEN")
    if not _BOOKING_HOST:
        missing.append("BOOKING_HOST")

    if missing:
        logger.warning(f"[TravelAPI] Eksik anahtarlar: {', '.join(missing)}")
        return False

    logger.info("[TravelAPI] API Istemcisi Hazir, Muhurler Tamam \u2713")
    return True

_config_ok = _validate_config()

# ── In-memory TTL Cache ───────────────────────────────────────────────────────
_flight_cache: dict = {}   # cache_key -> (timestamp, data)
_hotel_cache:  dict = {}
_dest_cache:   dict = {}   # city_lower -> (timestamp, {dest_id, search_type, name})
_DEST_CACHE_TTL = 24 * 3600  # 24 saat (sehir ID'leri degismez)

# ── Client Factories ──────────────────────────────────────────────────────────
@asynccontextmanager
async def _tp_client():
    """Travelpayouts API istemcisi."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        yield client

@asynccontextmanager
async def _booking_client():
    """Booking.com RapidAPI istemcisi — x-rapidapi-key ve x-rapidapi-host muhurlu."""
    async with httpx.AsyncClient(
        headers={
            "x-rapidapi-key":  _RAPIDAPI_KEY,
            "x-rapidapi-host": _BOOKING_HOST,
        },
        timeout=_TIMEOUT,
    ) as client:
        yield client

@asynccontextmanager
async def _kiwi_client():
    """Kiwi RapidAPI istemcisi."""
    async with httpx.AsyncClient(
        headers={
            "x-rapidapi-key":  _RAPIDAPI_KEY,
            "x-rapidapi-host": _KIWI_HOST,
        },
        timeout=_TIMEOUT,
    ) as client:
        yield client

# ── Helpers ───────────────────────────────────────────────────────────────────
def _build_tp_link(origin: str, dest: str, date: str) -> str:
    """
    Travelpayouts affiliate arama linki olustur.
    date: YYYY-MM-DD  (bos/gecersizse bugun+30 gun kullanilir)
    Ornek: IST, BUS, 2026-06-01 -> https://www.aviasales.com/search/IST01JUNBUS1/1/0/0?marker=710551
    /1/0/0 = 1 adult, 0 children, 0 infants (browser localStorage override)
    """
    try:
        from datetime import timedelta
        if not date or len(str(date)) < 8:
            dt = datetime.utcnow() + timedelta(days=30)
        else:
            dt = datetime.strptime(str(date)[:10], "%Y-%m-%d")
        day = dt.strftime("%d")
        mon = _TP_MONTHS[dt.month - 1]
        url = _TP_SEARCH_URL.format(origin=origin, day=day, mon=mon, dest=dest) + "/1/0/0"
        return build_affiliate_link(url)
    except Exception:
        return build_affiliate_link(f"https://www.aviasales.com/?marker={_TP_MARKER}")

def _build_kiwi_search_link(origin: str, dest: str, date: str) -> str:
    """Direct kiwi.com search link using city-country slugs (e.g. istanbul-turkey).

    City-country slugs are the most reliable Kiwi URL format — airport: prefix
    and bare IATA codes both left from/to fields empty in practice.
    Falls back to airport: prefix if slug not in the mapping.
    """
    o = origin.upper()
    d = dest.upper()
    origin_slug = _IATA_TO_KIWI_SLUG.get(o, f"airport:{o}")
    dest_slug   = _IATA_TO_KIWI_SLUG.get(d, f"airport:{d}")
    try:
        dt = datetime.strptime(str(date)[:10], "%Y-%m-%d")
        return (
            f"https://www.kiwi.com/en/search/results"
            f"/{origin_slug}/{dest_slug}/{dt.strftime('%Y-%m-%d')}/"
        )
    except Exception:
        return f"https://www.kiwi.com/en/search/results/{origin_slug}/{dest_slug}/"

def _map_tp_flight(item: dict, origin: str, dest: str, date: str) -> dict:
    return {
        "price":          item.get("value", 0),
        "currency":       "TRY",
        "airline":        item.get("gate", "?"),
        "departure":      item.get("depart_date"),
        "departure_code": origin.upper() if origin else "",
        "arrival_code":   dest.upper()   if dest   else "",
        "return":         item.get("return_date") or None,
        "duration":       item.get("duration", 0),
        "stops":          item.get("number_of_changes", 0),
        "link":           _build_tp_link(origin, dest, date),
    }

def _map_kiwi_flight(item: dict, origin: str, dest: str, dep_date: str) -> dict:
    """Kiwi RapidAPI uçuş sonucunu standart formata çevirir.
    Gerçek response yapısı: price.amount, sector.sectorSegments[0].segment.carrier.code,
    sector.sectorSegments[0].segment.source.localTime, sector.duration (saniye),
    bookingOptions.edges[0].node.bookingUrl
    """
    # price
    price_raw = item.get("price", 0)
    if isinstance(price_raw, dict):
        price_usd = float(price_raw.get("amount") or price_raw.get("value") or 0)
    else:
        price_usd = float(price_raw or 0)
    price_try = round(price_usd * _USD_RATE, 0)

    # airline ve departure -> sector.sectorSegments
    airline    = ""
    departure  = dep_date
    sector     = item.get("sector") or {}
    segs       = sector.get("sectorSegments") or []
    if segs:
        first_seg = (segs[0] or {}).get("segment") or {}
        carrier   = first_seg.get("carrier") or {}
        airline   = carrier.get("code") or carrier.get("name") or ""
        source    = first_seg.get("source") or {}
        departure = source.get("localTime") or dep_date

    # duration -> sector.duration (saniye -> dakika)
    duration_sec = sector.get("duration", 0) or 0
    duration_min = duration_sec // 60

    # session-based bookingUrl expires → always use a fresh search link
    link = (
        f"https://www.kiwi.com/en/search/results"
        f"/airport:{origin.upper()}/airport:{dest.upper()}/{dep_date}/"
    )

    return {
        "price":          price_try,
        "currency":       "TRY",
        "airline":        airline or "?",
        "departure":      departure,
        "departure_code": origin.upper() if origin else "",
        "arrival_code":   dest.upper()   if dest   else "",
        "return":         None,
        "duration":       duration_min,
        "stops":          0,
        "link":           link,
    }

async def _search_kiwi(origin: str, destination: str, dep_date: str,
                        budget: float = None,
                        timeout: httpx.Timeout = None) -> list:
    """Kiwi RapidAPI ile uçuş ara — doğru parametre formatıyla."""
    if not _RAPIDAPI_KEY or not _KIWI_HOST:
        return []
    params = {
        "source":           f"Airport:{origin}",
        "destination":      f"Airport:{destination}",
        "currency":         "usd",
        "locale":           "en",
        "adults":           1,
        "children":         0,
        "infants":          0,
        "handbags":         1,
        "holdbags":         0,
        "cabinClass":       "ECONOMY",
        "sortBy":           "PRICE",
        "sortOrder":        "ASCENDING",
        "transportTypes":   "FLIGHT",
        "contentProviders": "FRESH,KIWI,KAYAK",
        "limit":            10,
    }
    if dep_date:
        params["dateFrom"] = dep_date   # YYYY-MM-DD
        params["dateTo"]   = dep_date
    try:
        async with httpx.AsyncClient(
            headers={"x-rapidapi-key": _RAPIDAPI_KEY, "x-rapidapi-host": _KIWI_HOST},
            timeout=timeout or _TIMEOUT,
        ) as client:
            resp = await client.get(f"https://{_KIWI_HOST}/one-way", params=params)
        print(f"[Kiwi] HTTP {resp.status_code}: {origin}->{destination} {dep_date}")
        if resp.status_code == 429:
            print(f"[Kiwi] Rate limit: {origin}->{destination}")
            return []
        if resp.status_code != 200:
            print(f"[Kiwi] Hata {resp.status_code}: {resp.text[:400]}")
            return []
        body = resp.json()
        raw  = body.get("itineraries") or []
        print(f"[Kiwi] {len(raw)} itinerary: {origin}->{destination}")
        flights = []
        for f in raw:
            if not isinstance(f, dict):
                continue
            try:
                flights.append(_map_kiwi_flight(f, origin, destination, dep_date))
            except Exception as map_err:
                print(f"[Kiwi] map hata: {map_err}")
        if budget:
            flights = [f for f in flights if f["price"] <= budget]
        flights.sort(key=lambda f: f["price"])
        return flights
    except httpx.TimeoutException:
        print(f"[Kiwi] Timeout: {origin}->{destination}")
        return []
    except Exception as e:
        print(f"[Kiwi] Exception: {e}")
        return []

# ── Public API ────────────────────────────────────────────────────────────────
async def search_flights(
    origin: str,
    destination: str,
    date: str,
    return_date: str = None,
    passengers: int = 1,
    budget: float = None,
) -> list:
    """
    Travelpayouts Aviasales API ile ucus ara.
    - En ucuzdan sirala (API zaten price'a gore sirali donduruyor)
    - Butce filtresi: budget TRY ise filtrele
    - 4 saatlik TTL cache
    Returns: list[dict] | []
    """
    cache_key = f"flights:{origin}:{destination}:{date}:{return_date}"
    now = datetime.utcnow().timestamp()
    cached_entry = _flight_cache.get(cache_key)
    if cached_entry:
        ts, data = cached_entry
        if now - ts < _CACHE_TTL:
            logger.info(f"[CACHE] Ucus cache'den getirildi | {cache_key}")
            return data

    # 1. Kiwi önce (tarihli sorgu)
    flights = []
    if date and _RAPIDAPI_KEY and _KIWI_HOST:
        print(f"[Kiwi] Oncelikli sorgu: {origin}->{destination} {date}")
        flights = await _search_kiwi(origin, destination, date, budget)

    # 2. Kiwi boşsa -> Travelpayouts fallback
    if not flights and _TP_TOKEN:
        params = {
            "origin":      origin,
            "destination": destination,
            "currency":    "try",
            "limit":       5,
            "token":       _TP_TOKEN,
            "marker":      _TP_MARKER,
        }
        if return_date:
            params["return_date"] = return_date
        if date:
            params["depart_date"] = date

        try:
            async with _tp_client() as client:
                resp = await client.get(_TP_PRICES_URL, params=params)

            if resp.status_code == 429:
                logger.warning(f"[RATE LIMIT] TP limiti doldu | {cache_key}")
                return cached_entry[1] if cached_entry else []
            if resp.status_code == 200:
                raw = resp.json().get("data", [])
                tp_flights = [_map_tp_flight(f, origin, destination, date or "") for f in raw]
                if budget:
                    tp_flights = [f for f in tp_flights if f["price"] <= budget]
                tp_flights.sort(key=lambda f: f["price"])
                flights = tp_flights
                print(f"[TP] Fallback: {len(flights)} ucus: {origin}->{destination}")

            # 3. TP tarihli de boşsa -> TP tarihsiz (herhangi cached fiyat)
            if not flights:
                params_nodate = {k: v for k, v in params.items() if k != "depart_date"}
                try:
                    async with _tp_client() as client:
                        resp2 = await client.get(_TP_PRICES_URL, params=params_nodate)
                    if resp2.status_code == 200:
                        raw2 = resp2.json().get("data", [])
                        flights2 = [_map_tp_flight(f, origin, destination, date or "") for f in raw2]
                        if budget:
                            flights2 = [f for f in flights2 if f["price"] <= budget]
                        flights2.sort(key=lambda f: f["price"])
                        flights = flights2
                        print(f"[TP] Tarihsiz fallback: {len(flights)} uçuş")
                except Exception:
                    pass

        except httpx.TimeoutException:
            logger.warning(f"[TP] Timeout: {origin}->{destination}")
        except Exception as e:
            logger.error(f"[TP] Hata: {e}")

    _flight_cache[cache_key] = (now, flights)
    print(f"[Flights] Toplam {len(flights)} ucus: {origin}->{destination}")
    return flights


async def resolve_destination(city: str) -> dict | None:
    """
    Sehir adini Booking.com dest_id'ye cevirir.
    Sadece search_type='city' sonuclari alinir.
    Ornek: 'Cesme' -> {'dest_id': '-743111', 'search_type': 'city', 'name': 'Cesme...'}
    24 saatlik cache.
    """
    key = city.lower().strip()
    now = datetime.utcnow().timestamp()
    if key in _dest_cache:
        ts, d = _dest_cache[key]
        if now - ts < _DEST_CACHE_TTL:
            logger.info(f"[CACHE] \u2713 Sehir ID cache'den getirildi \u2014 API cagirilmadi | {key}")
            return d

    try:
        async with _booking_client() as client:
            resp = await client.get(
                f"https://{_BOOKING_HOST}/api/v1/hotels/searchDestination",
                params={"query": city},
            )
        if resp.status_code != 200:
            logger.warning(f"[Booking] searchDestination HTTP {resp.status_code}")
            return None

        results = resp.json().get("data", [])
        city_hit = next((r for r in results if r.get("search_type") == "city"), None)
        if not city_hit:
            logger.warning(f"[Booking] '{city}' icin search_type=city sonucu yok")
            return None

        dest = {
            "dest_id":     city_hit.get("dest_id") or city_hit.get("id"),
            "search_type": "city",
            "name":        city_hit.get("name", city),
        }
        _dest_cache[key] = (now, dest)
        logger.info(f"[Booking] Destination: {city} -> dest_id={dest['dest_id']} ({dest['name']})")
        return dest

    except Exception as e:
        logger.error(f"[Booking] resolve_destination hatasi: {e}")
        return None


def _map_hotel(item: dict, dest_id: str = "", checkin: str = "", checkout: str = "") -> dict:
    prop       = item.get("property", item)
    price_info = (prop.get("priceBreakdown") or {}).get("grossPrice", {})
    photos     = prop.get("photoUrls") or []
    hotel_id   = item.get("hotel_id") or prop.get("id", "")
    # Booking.com hotel arama linki (affiliate ile)
    if hotel_id:
        base_url = (
            f"https://www.booking.com/hotel/tr/{hotel_id}.html"
            f"?checkin={checkin}&checkout={checkout}"
        )
    else:
        base_url = (
            f"https://www.booking.com/searchresults.html"
            f"?dest_id={dest_id}&checkin={checkin}&checkout={checkout}"
        )
    price_val = round(price_info.get("value", 0), 2)
    return {
        "hotel_name":    prop.get("name", "?"),
        "price":         price_val,
        "price_per_night": price_val,   # alias — frontend mock ile uyumlu
        "currency":      price_info.get("currency") or prop.get("currency", "USD"),
        "rating":        prop.get("reviewScore", 0),
        "stars":         prop.get("accuratePropertyClass") or prop.get("propertyClass", 0),
        "image_url":     photos[0] if photos else None,   # photo_url -> image_url
        "address":       prop.get("address") or prop.get("addressLine1") or None,
        "link":          build_affiliate_link(base_url),
    }


def calc_hotel_budget(
    total_budget_try: float,
    flight_cost_try: float,
    nights: int,
) -> float | None:
    """
    Gecelik max otel butcesi hesaplar (TRY).
    Dogrudan search_hotels(budget_try=...) e gonderilir.

    Ornek: 15000 TRY toplam, 2500 TRY ucus, 3 gece
           -> (15000 - 2500) / 3 = 4166 TRY/gece
    """
    remaining = total_budget_try - flight_cost_try
    if remaining <= 0 or nights <= 0:
        return None
    return (remaining / nights) * 1.1  # %10 esneklik buffer'ı


async def search_hotels(
    destination: str,
    checkin: str,
    checkout: str,
    guests: int = 1,
    budget_try: float = None,  # TRY cinsinden gecelik max (ucus cikarilmis)
) -> list:
    """
    Booking.com via RapidAPI — otel ara, butceye gore filtrele, en ucuzdan sirala.
    1. resolve_destination() ile sehir ID'si alinir
    2. budget_try varsa USD'ye cevrilerek price_max olarak API'ye gonderilir
       (1 USD = _USD_RATE TRY sabit kur)
    3. API'den max 20 sonuc cekip fiyata gore siralar, ilk 3'u dondurur
    4. 4 saatlik TTL cache
    Returns: list[dict] (max 3) | []
    """
    if not _RAPIDAPI_KEY or not _BOOKING_HOST:
        return []

    dest = await resolve_destination(destination)
    if not dest:
        return []

    cache_key = f"hotels:{destination}:{checkin}:{checkout}:{guests}:{budget_try}"
    now = datetime.utcnow().timestamp()
    cached_entry = _hotel_cache.get(cache_key)
    if cached_entry:
        ts, data = cached_entry
        if now - ts < _CACHE_TTL:
            logger.info(f"[CACHE] \u2713 Otel cache'den getirildi \u2014 API cagirilmadi | {cache_key}")
            return data

    params = {
        "dest_id":      dest["dest_id"],
        "search_type":  dest["search_type"],
        "arrival_date": checkin,
        "departure_date": checkout,
        "adults_number": guests,
        "room_number":  1,
        "order_by":     "popularity",
        "units":        "metric",
    }
    if budget_try:
        params["price_max"] = round(budget_try / _USD_RATE, 2)
        logger.info(f"[Booking] price_max={params['price_max']} USD ({budget_try:.0f} TRY/gece)")

    try:
        async with _booking_client() as client:
            resp = await client.get(
                f"https://{_BOOKING_HOST}/api/v1/hotels/searchHotels",
                params=params,
            )
        if resp.status_code == 429:
            logger.warning(f"[RATE LIMIT] Booking otel API limiti doldu \u2014 "
                           f"{'eski cache kullaniliyor' if cached_entry else 'cache bos'} | {cache_key}")
            return cached_entry[1] if cached_entry else []
        if resp.status_code != 200:
            logger.warning(f"[Booking] searchHotels HTTP {resp.status_code}: {resp.text[:200]}")
            return []

        raw    = resp.json().get("data", {}).get("hotels", [])
        hotels = [_map_hotel(h, dest["dest_id"], checkin, checkout) for h in raw[:20]]
        hotels.sort(key=lambda h: h["price"])
        hotels = hotels[:3]

        _hotel_cache[cache_key] = (now, hotels)
        logger.info(f"[Booking] {len(hotels)} otel bulundu: {destination}")
        return hotels

    except httpx.TimeoutException:
        logger.warning(f"[Booking] Timeout: {destination}")
        return []
    except Exception as e:
        logger.error(f"[Booking] Hata: {e}")
        return []


def build_affiliate_link(url: str, marker: str = None) -> str:
    """Travelpayouts affiliate link builder — marker ekler."""
    m = marker or _TP_MARKER
    if not m or not url:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}marker={m}"


_wiki_sem: "asyncio.Semaphore | None" = None

def _get_wiki_sem():
    import asyncio
    global _wiki_sem
    if _wiki_sem is None:
        _wiki_sem = asyncio.Semaphore(3)
    return _wiki_sem


async def get_city_image(iata: str) -> str:
    """Wikipedia Summary API ile sehir fotografi. 24 saat cache'li."""
    fallback = f"https://picsum.photos/seed/{iata}/800/500"
    wiki_title = _IATA_TO_WIKI_TITLE.get(iata.upper())
    if not wiki_title:
        return fallback

    cache_key = iata.upper()
    now = datetime.utcnow().timestamp()
    cached = _unsplash_cache.get(cache_key)
    if cached:
        ts, url = cached
        if now - ts < _UNSPLASH_CACHE_TTL:
            return url

    try:
        async with _get_wiki_sem():
            async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
                resp = await client.get(
                    f"https://en.wikipedia.org/api/rest_v1/page/summary/{wiki_title}",
                    headers={"User-Agent": "PLANiGO/1.0 (travel-app; contact@planigo.com)"},
                )
        if resp.status_code == 200:
            data = resp.json()
            source = (data.get("thumbnail") or {}).get("source", "")
            if source:
                url = _re.sub(r'/\d+px-', '/1280px-', source)
            else:
                url = fallback
            _unsplash_cache[cache_key] = (now, url)
            return url
        print(f"[Wiki] HTTP {resp.status_code}: {iata}")
    except Exception as e:
        print(f"[Wiki] Hata: {iata} - {e}")
    return fallback


# ── Discovery: tarihsiz en ucuz rota fiyatı ───────────────────────────────────
_cheapest_cache: dict = {}   # cache_key -> (timestamp, data)
_CHEAPEST_CACHE_TTL = 8 * 3600  # 8 saat


def _month_to_date(depart_at: str | None) -> str:
    """'2026-04' -> '2026-04-15'; None -> bugün+30 gün."""
    from datetime import timedelta
    if depart_at and len(depart_at) >= 7:
        return depart_at[:7] + "-15"
    return (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d")


async def get_route_cheapest(origin: str, dest: str, depart_at: str | None = None) -> dict | None:
    """
    Kiwi API (önce) -> Travelpayouts (fallback) ile bir rota için en ucuz bilet.
    depart_at: "YYYY-MM" formatında ay filtresi.
    Returns: {"price", "origin", "destination", "airline", "depart_date", "link"} veya None
    """
    cache_key = f"cheapest:{origin}:{dest}:{depart_at or 'any'}"
    now = datetime.utcnow().timestamp()
    cached = _cheapest_cache.get(cache_key)
    if cached:
        ts, data = cached
        if now - ts < _CHEAPEST_CACHE_TTL:
            return data

    # 1. Kiwi önce
    if _RAPIDAPI_KEY and _KIWI_HOST:
        kiwi_date = _month_to_date(depart_at)
        kiwi_results = await _search_kiwi(origin, dest, kiwi_date, timeout=_DISCOVERY_TIMEOUT)
        if kiwi_results:
            best = kiwi_results[0]
            dep_raw = best.get("departure") or kiwi_date
            result = {
                "price":       best["price"],
                "origin":      origin,
                "destination": dest,
                "airline":     best.get("airline", ""),
                "depart_date": dep_raw[:10] if dep_raw else kiwi_date,
                "link":        best.get("link"),
            }
            _cheapest_cache[cache_key] = (now, result)
            logger.info(f"[Discovery/Kiwi] {origin}->{dest} ₺{result['price']}")
            return result

    # 2. TP fallback
    if not _TP_TOKEN:
        return None
    url = (f"{_TP_PRICES_URL}?origin={origin}&destination={dest}"
           f"&currency=try&limit=1&token={_TP_TOKEN}")
    if depart_at:
        url += f"&depart_at={depart_at}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return None
        tickets = r.json().get("data", [])
        if not tickets:
            return None
        t = tickets[0]
        result = {
            "price":       t.get("price", 0),
            "origin":      origin,
            "destination": dest,
            "airline":     t.get("airline", ""),
            "depart_date": t.get("depart_date", ""),
            "link":        None,  # discovery_router _build_tp_link ile dolduracak
        }
        _cheapest_cache[cache_key] = (now, result)
        logger.info(f"[Discovery/TP] {origin}->{dest} ₺{result['price']}")
        return result
    except Exception as e:
        logger.warning(f"[Discovery] {origin}->{dest} hata: {e}")
        return None
