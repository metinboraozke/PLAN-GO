"""
PLANİGO - Planner Router
Smart Planner ve Wishlist endpoint'leri.
Extracted from main.py lines 335-1089.
"""

import asyncio
import logging
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query, status
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

from database import DatabaseManager, WishlistService, COLLECTIONS
from services.push_service import send_push
from models import (
    WishlistCreate,
    WishlistInDB,
    WishlistResponse,
    TripStatus,
    PlannerResponse,
    ScrapeResponse,
    PlanDetailsResponse,
    BudgetCalculateResponse,
)
from planner import generate_null_plan, generate_ai_day_plans
from auth import get_optional_user, get_current_user
from gemini import generate_pax_itinerary
from services.travel_api import search_flights, search_hotels, calc_hotel_budget, _USD_RATE, _build_tp_link, _build_kiwi_search_link

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Smart Planner"])

# ── IATA Display Dict ──────────────────────────────────────────────────────────
_IATA_DISPLAY: dict[str, str] = {
    # Türkiye
    "IST": "İstanbul", "SAW": "İstanbul (Sabiha)", "ADB": "İzmir",
    "AYT": "Antalya",  "ESB": "Ankara",            "TZX": "Trabzon",
    "GZT": "Gaziantep","MLX": "Malatya",            "VAN": "Van",
    "DLM": "Dalaman",  "BJV": "Bodrum",             "ASR": "Kayseri",
    "GNY": "Şanlıurfa","ERC": "Erzincan",           "ERZ": "Erzurum",
    "KYA": "Konya",    "SZF": "Samsun",             "MQM": "Mardin",
    # Avrupa
    "CDG": "Paris",    "ORY": "Paris (Orly)",       "LHR": "Londra",
    "LGW": "Londra (Gatwick)", "FCO": "Roma",        "CIA": "Roma (Ciampino)",
    "BCN": "Barselona","MAD": "Madrid",              "AMS": "Amsterdam",
    "FRA": "Frankfurt","MUC": "Münih",               "BER": "Berlin",
    "VIE": "Viyana",   "ZRH": "Zürih",              "GVA": "Cenevre",
    "ATH": "Atina",    "SKG": "Selanik",             "OTP": "Bükreş",
    "SOF": "Sofya",    "BEG": "Belgrad",             "PRG": "Prag",
    "BUD": "Budapeşte","WAW": "Varşova",             "CPH": "Kopenhag",
    "ARN": "Stockholm","HEL": "Helsinki",            "OSL": "Oslo",
    # Orta Doğu & Afrika
    "DXB": "Dubai",    "AUH": "Abu Dabi",            "DOH": "Doha",
    "CAI": "Kahire",   "CMN": "Kazablanka",          "JNB": "Johannesburg",
    # Asya & Pasifik
    "BKK": "Bangkok",  "DMK": "Bangkok (Don Mueang)","SIN": "Singapur",
    "NRT": "Tokyo",    "HND": "Tokyo (Haneda)",       "ICN": "Seul",
    "PEK": "Pekin",    "PVG": "Şanghay",             "HKG": "Hong Kong",
    "KUL": "Kuala Lumpur", "CGK": "Cakarta",         "SYD": "Sidney",
    # Amerika
    "JFK": "New York", "EWR": "New York (Newark)",   "LAX": "Los Angeles",
    "ORD": "Chicago",  "MIA": "Miami",               "YYZ": "Toronto",
    "GRU": "São Paulo","EZE": "Buenos Aires",        "MEX": "Mexico City",
}
# Bilinmeyen IATA → ham kod döner, crash olmaz

# ── Travel data helpers ────────────────────────────────────────────────────────

def _calc_return_date(
    start_date,
    end_date,
    date_type: str,
    flexible_duration: str | None,
    nights: int,
) -> str | None:
    """Dönüş tarihini hesapla. end_date varsa direkt kullan, yoksa flexible_duration'dan."""
    if end_date:
        return str(end_date)
    if date_type == "flexible" and start_date:
        if flexible_duration == "weekend":
            return str(start_date + timedelta(days=3))
        if flexible_duration == "week":
            return str(start_date + timedelta(days=7))
        if nights and nights > 0:
            return str(start_date + timedelta(days=nights))
    return None


async def _fetch_travel_data(
    wishlist_id:      str,
    origin:           str,
    destination:      str,
    destination_iata: str | None,
    start_date:       str | None,
    return_date:      str | None,
    nights:           int,
    total_budget:     float | None,
    guests:           int = 1,
):
    """Arka planda: TP gidiş+dönüş uçuşları + Booking otelleri çek → trip_details'e yaz."""
    try:
        outbound_list: list = []
        return_list:   list = []

        if not destination_iata:
            logger.warning(f"[TravelData] IATA kodu yok, ucus aramasi atlaniyor | dest={destination} id={wishlist_id}")

        if destination_iata and start_date:
            tasks = [search_flights(origin, destination_iata, start_date)]
            if return_date:
                tasks.append(search_flights(destination_iata, origin, return_date))
            results = await asyncio.gather(*tasks, return_exceptions=True)
            outbound_list = results[0] if isinstance(results[0], list) else []
            return_list   = results[1] if len(results) > 1 and isinstance(results[1], list) else []

        outbound = outbound_list[0] if outbound_list else None
        ret      = return_list[0]   if return_list   else None

        outbound_cost = float(outbound["price"]) if outbound else 0.0
        return_cost   = float(ret["price"])       if ret      else 0.0
        total_flight  = outbound_cost + return_cost

        hotel_budget_per_night = None
        if total_budget and total_budget > 0:
            hotel_budget_per_night = calc_hotel_budget(total_budget, total_flight, nights)

        checkin  = start_date
        checkout = return_date or (
            str(date.fromisoformat(start_date) + timedelta(days=nights))
            if start_date else None
        )

        hotels: list = []
        if checkin and checkout:
            hotels = await search_hotels(
                destination, checkin, checkout,
                guests=guests, budget_try=hotel_budget_per_night,
            )

        def _flight_dict(f, dep_code, arr_code):
            if not f:
                return None
            airline = f.get("airline") or ""
            return {
                "departure_code": dep_code,
                "arrival_code":   arr_code,
                "departure_city": _IATA_DISPLAY.get(dep_code, dep_code),
                "arrival_city":   _IATA_DISPLAY.get(arr_code, arr_code),
                "price":          f["price"],
                "currency":       f.get("currency", "TRY"),
                "airline":        airline,
                "airline_logo_url": (
                    f"https://content.airhex.com/content/logos/airlines_{airline}_35_35_t.png"
                    if airline else None
                ),
                "departure_time": f.get("departure") or "",
                "arrival_time":   "",
                "stops":          f.get("stops", 0),
                "duration":       str(f.get("duration", "")) if f.get("duration") else "",
                "link":           f.get("link"),
            }

        def _hotel_dict(h, n):
            if not h:
                return None
            # grossPrice.value = tüm konaklama toplamı (gecelik değil) — * n YAPMA
            price = float(h.get("price", 0))
            currency = h.get("currency", "USD")
            if currency == "USD" and price > 0:
                total_try = round(price * _USD_RATE, 0)
                per_night = round(total_try / max(1, n), 0)
                result = {**h, "price": total_try, "price_per_night": per_night,
                          "currency": "TRY", "nights": n,
                          "total_price": total_try}
                if result.get("stars", 1) < 1:
                    result["stars"] = 1
                return result
            per_night = round(price / max(1, n), 2)
            result = {**h, "price_per_night": per_night, "nights": n, "total_price": price}
            if result.get("stars", 1) < 1:
                result["stars"] = 1
            return result

        trip_details = {
            "outbound_flight":      _flight_dict(outbound, origin, destination_iata or "?"),
            "return_flight":        _flight_dict(ret, destination_iata or "?", origin),
            "hotel_options":        [_hotel_dict(h, nights) for h in hotels],
            "selected_hotel_index": 0,
            "budget_summary": {
                "target_budget":   total_budget,
                "outbound_cost":   outbound_cost,
                "return_cost":     return_cost,
                "total_flight":    total_flight,
                "hotel_per_night": hotel_budget_per_night,
                "currency":        "TRY",
            },
            "nights":          nights,
            "scraped_at":      datetime.utcnow().isoformat(),
            "scrape_provider": "travelpayouts+booking",
        }

        has_flights = bool(outbound or ret)
        has_hotels  = bool(hotels)
        has_data    = has_flights or has_hotels

        if has_data:
            cheapest_price = (outbound_cost + return_cost) if (outbound_cost or return_cost) else 1
            new_scrape_status = "ready"
        else:
            # API'ler boş döndü: polling hemen dursun, frontend "no_data" toast göstersin
            cheapest_price    = 1          # > 0 → polling durur
            new_scrape_status = "no_data"

        update_payload: dict = {
            "trip_details":  trip_details,
            "scrape_status": new_scrape_status,
            "current_price": cheapest_price,
            "notes":         "",
            "status":        "tracking",   # processing → tracking
        }
        await DatabaseManager.update_one(
            COLLECTIONS["wishlists"], wishlist_id, update_payload,
        )
        logger.info(
            f"[TravelData] {wishlist_id}: status={new_scrape_status} | "
            f"gidiş={outbound_cost:.0f} TRY dönüş={return_cost:.0f} TRY, {len(hotels)} otel"
        )

        # Push notification: tarama tamamlandıysa kullanıcıya bildir
        if new_scrape_status == "ready":
            try:
                wishlist_doc = await DatabaseManager.find_one(COLLECTIONS["wishlists"], wishlist_id)
                user_id = (wishlist_doc or {}).get("user_id")
                if user_id:
                    user_doc = await DatabaseManager.find_one(COLLECTIONS["users"], {"user_id": user_id})
                    fcm_token = (user_doc or {}).get("fcm_token")
                    if fcm_token:
                        dest = (wishlist_doc or {}).get("destination", "")
                        price = (trip_details.get("outbound_flight") or {}).get("price")
                        price_str = f" — En ucuz: {int(price):,} ₺".replace(",", ".") if price else ""
                        send_push(
                            fcm_token,
                            title="✈ Tarama Tamamlandı!",
                            body=f"{dest} planın hazır{price_str}",
                            data={"plan_id": str(wishlist_id)},
                        )
            except Exception as _pe:
                logger.warning(f"[Push] Bildirim gönderilemedi: {_pe}")

    except Exception as e:
        logger.error(f"[TravelData] {wishlist_id} hatası: {e}", exc_info=True)
        await DatabaseManager.update_one(
            COLLECTIONS["wishlists"], wishlist_id,
            {"scrape_status": "error", "notes": "", "current_price": 1},
        )


# ── 3-Senaryo Esnek Tarih ─────────────────────────────────────────────────────

def _generate_flexible_scenarios(flexible_month: str, flexible_duration: str) -> list[tuple[str, str, int]]:
    """
    Esnek tarih için 3 farklı (start, return, nights) senaryosu üretir.
    Döndürür: [(start_str, return_str, nights), ...]
    """
    month_map = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }
    today       = date.today()
    month_num   = month_map.get((flexible_month or "").lower()[:3], today.month)
    year        = today.year if month_num >= today.month else today.year + 1
    _dur_lower  = (flexible_duration or "").lower().strip()
    is_week     = _dur_lower == "week"
    nights      = 7 if is_week else (4 if _dur_lower == "3-5" else 3)

    scenarios: list[tuple[str, str, int]] = []
    tomorrow    = today + timedelta(days=1)   # geçmiş tarih filtresi

    if is_week:
        # Ayın 3 farklı haftalık dilimi: 1., 8., 15. — geçmiş ise atla
        for day in (1, 8, 15):
            try:
                start = date(year, month_num, day)
                if start <= today:          # geçmişte kalan günü atla
                    continue
                ret   = start + timedelta(days=nights)
                scenarios.append((str(start), str(ret), nights))
            except ValueError:
                continue
        # Yeterli senaryo yoksa ileriki aya taşı
        if len(scenarios) < 1:
            next_month = month_num % 12 + 1
            next_year  = year + (1 if next_month == 1 else 0)
            for day in (1, 8, 15):
                try:
                    start = date(next_year, next_month, day)
                    scenarios.append((str(start), str(start + timedelta(days=nights)), nights))
                except ValueError:
                    continue
    else:
        # Ayın Cuma-başlangıçlı hafta sonu senaryoları (geçmiş olmayanlar)
        first_day      = date(year, month_num, 1)
        days_to_friday = (4 - first_day.weekday()) % 7
        # Ayın tüm Cumalarını üret (4 adet), sonraki aydan da al
        candidate_fridays: list[date] = []
        for i in range(5):
            candidate_fridays.append(first_day + timedelta(days=days_to_friday + 7 * i))
        # Bir sonraki ayın Cumalarını da ekle (ay sonu kısıtı için)
        next_month = month_num % 12 + 1
        next_year  = year + (1 if next_month == 1 else 0)
        nxt_first  = date(next_year, next_month, 1)
        nxt_friday = (4 - nxt_first.weekday()) % 7
        for i in range(3):
            candidate_fridays.append(nxt_first + timedelta(days=nxt_friday + 7 * i))
        # Tekrar edenleri temizle, geçmiş olmayanlardan ilk 3'ü al
        seen: set = set()
        unique_fridays: list[date] = []
        for f in candidate_fridays:
            if f not in seen:
                seen.add(f); unique_fridays.append(f)
        future_fridays = [f for f in unique_fridays if f > today][:3]
        for fri in future_fridays:
            try:
                scenarios.append((str(fri), str(fri + timedelta(days=nights)), nights))
            except ValueError:
                continue

    # Fallback: bulunan ilk ileriki tarih
    if not scenarios:
        start = date(year, month_num, 15)
        if start <= today:
            start = tomorrow
        scenarios.append((str(start), str(start + timedelta(days=nights)), nights))

    return scenarios


async def _fetch_one_scenario(
    origin:           str,
    destination:      str,
    destination_iata: str,
    start_date:       str,
    return_date:      str,
    nights:           int,
    total_budget:     float | None,
    guests:           int,
) -> dict | None:
    """Tek bir senaryo için uçuş + otel sorgular; toplam maliyetiyle döner."""
    try:
        tasks = [search_flights(origin, destination_iata, start_date)]
        tasks.append(search_flights(destination_iata, origin, return_date))
        results = await asyncio.gather(*tasks, return_exceptions=True)

        outbound_list = results[0] if isinstance(results[0], list) else []
        return_list   = results[1] if isinstance(results[1], list) else []

        outbound = outbound_list[0] if outbound_list else None
        ret      = return_list[0]   if return_list   else None

        outbound_cost = float(outbound["price"]) if outbound else 0.0
        return_cost   = float(ret["price"])       if ret      else 0.0
        total_flight  = outbound_cost + return_cost

        hotel_budget_per_night = None
        if total_budget and total_budget > 0:
            hotel_budget_per_night = calc_hotel_budget(total_budget, total_flight, nights)

        checkout = return_date or str(date.fromisoformat(start_date) + timedelta(days=nights))
        hotels = await search_hotels(
            destination, start_date, checkout,
            guests=guests, budget_try=hotel_budget_per_night,
        )

        # grossPrice.value = toplam konaklama fiyatı — sadece kur çevirimi, * nights YOK
        hotel_price = float(hotels[0].get("price", 0)) if hotels else 0.0
        hotel_curr  = hotels[0].get("currency", "USD") if hotels else "USD"
        hotel_cost  = round(hotel_price * _USD_RATE, 0) if hotel_curr == "USD" else hotel_price
        total_cost  = total_flight + hotel_cost

        return {
            "start_date":   start_date,
            "return_date":  return_date,
            "nights":       nights,
            "outbound":     outbound,
            "ret":          ret,
            "hotels":       hotels,
            "outbound_cost": outbound_cost,
            "return_cost":  return_cost,
            "total_flight": total_flight,
            "hotel_budget_per_night": hotel_budget_per_night,
            "total_cost":   total_cost,
        }
    except Exception as e:
        logger.warning(f"[FlexScenario] {start_date} senaryosu başarısız: {e}")
        return None


async def _fetch_flexible_best_deal(
    wishlist_id:      str,
    origin:           str,
    destination:      str,
    destination_iata: str | None,
    flexible_month:   str | None,
    flexible_duration: str | None,
    total_budget:     float | None,
    guests:           int = 1,
):
    """
    Esnek tarihte 3 senaryo oluştur, paralel sorgula, en ucuzu seç ve kaydet.
    IATA yoksa tek senaryo ile _fetch_travel_data'ya düşer.
    """
    print(f"[FlexBest] BAŞLADI id={wishlist_id} iata={destination_iata} month={flexible_month} dur={flexible_duration}")
    if not destination_iata:
        logger.warning(f"[FlexBest] IATA yok, sabit tarih fallback | id={wishlist_id}")
        print(f"[FlexBest] IATA yok, fallback: id={wishlist_id}")
        # Yine de otel araması yapılabilsin diye ayın 15. ile çalıştır
        today = date.today()
        month_map = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
                     "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
        month_num = month_map.get((flexible_month or "").lower()[:3], today.month)
        year      = today.year if month_num >= today.month else today.year + 1
        _fb_dur = (flexible_duration or "").lower().strip()
        nights  = 7 if _fb_dur == "week" else (4 if _fb_dur == "3-5" else 3)
        start     = date(year, month_num, 15)
        await _fetch_travel_data(
            wishlist_id=wishlist_id,
            origin=origin,
            destination=destination,
            destination_iata=None,
            start_date=str(start),
            return_date=str(start + timedelta(days=nights)),
            nights=nights,
            total_budget=total_budget,
            guests=guests,
        )
        return

    scenarios = _generate_flexible_scenarios(flexible_month or "", flexible_duration or "")
    print(f"[FlexBest] {len(scenarios)} senaryo: {[s[0] for s in scenarios]}")
    logger.info(f"[FlexBest] {wishlist_id}: {len(scenarios)} senaryo sorgulanıyor: {[s[0] for s in scenarios]}")

    results = await asyncio.gather(*[
        _fetch_one_scenario(
            origin, destination, destination_iata,
            s[0], s[1], s[2], total_budget, guests,
        )
        for s in scenarios
    ], return_exceptions=True)

    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning(f"[FlexBest] {wishlist_id}: senaryo {i} exception: {r}")

    valid = [r for r in results if isinstance(r, dict) and r is not None]
    logger.info(f"[FlexBest] {wishlist_id}: {len(valid)}/{len(results)} senaryo geçerli")
    # En ucuz toplam maliyetli senaryoyu seç (uçak + otel)
    with_flights = [r for r in valid if r["outbound"] or r["ret"]]
    best = min(with_flights, key=lambda r: r["total_cost"], default=None)
    if not best:
        best = min(valid, key=lambda r: r["total_cost"], default=None)

    if best:
        await _fetch_travel_data(
            wishlist_id=wishlist_id,
            origin=origin,
            destination=destination,
            destination_iata=destination_iata,
            start_date=best["start_date"],
            return_date=best["return_date"],
            nights=best["nights"],
            total_budget=total_budget,
            guests=guests,
        )
        # start_date / end_date'i de wishlist'e yaz (hangi tarih seçildi?)
        await DatabaseManager.update_one(
            COLLECTIONS["wishlists"], wishlist_id,
            {
                "start_date": best["start_date"],   # string "YYYY-MM-DD"
                "end_date":   best["return_date"],  # string "YYYY-MM-DD"
            },
        )
        logger.info(
            f"[FlexBest] {wishlist_id}: en ucuz senaryo={best['start_date']} "
            f"toplam={best['total_cost']:.0f} TRY"
        )
    else:
        logger.warning(f"[FlexBest] {wishlist_id}: tüm senaryolar başarısız")
        # Uçuş/otel verisi olmasa bile en azından ilk senaryonun tarihlerini yaz
        fallback_start = scenarios[0][0] if scenarios else None   # already string
        fallback_end   = scenarios[0][1] if scenarios else None
        fallback_update: dict = {
            "scrape_status": "no_data",
            "notes":         "Fiyat bilgisi bulunamadı",
            "current_price": 1,
            "status":        "tracking",
        }
        if fallback_start:
            fallback_update["start_date"] = fallback_start
            fallback_update["end_date"]   = fallback_end
        await DatabaseManager.update_one(
            COLLECTIONS["wishlists"], wishlist_id, fallback_update,
        )


# ── Background helper ─────────────────────────────────────────────────────────

async def _generate_and_save_ai_itinerary(wishlist_id: str, destination: str, nights: int):
    """Plan oluşturulunca arka planda çalışır. Gemini'den itinerary alır ve kaydeder."""
    try:
        city   = destination.split(",")[0].strip() or destination
        days   = max(1, min(int(nights), 14))
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


# ── Wishlist CRUD ─────────────────────────────────────────────────────────────

async def _create_wishlist_impl(wishlist: WishlistCreate, background_tasks: BackgroundTasks, current_user: dict = None):
    """Shared implementation for multiple POST endpoints."""
    try:
        scrape_date              = wishlist.start_date.isoformat() if wishlist.start_date else None
        destination_display      = getattr(wishlist, "destination_display", None) or wishlist.destination
        destination_lat          = getattr(wishlist, "destination_lat", None)
        destination_lng          = getattr(wishlist, "destination_lng", None)
        destination_country      = getattr(wishlist, "destination_country", None)
        destination_country_code = getattr(wishlist, "destination_country_code", None)
        trip_name                = wishlist.trip_name or f"{wishlist.origin} → {destination_display}"

        wishlist_db = WishlistInDB(
            user_id=current_user["user_id"],
            trip_name=trip_name,
            origin=wishlist.origin,
            destination=wishlist.destination,
            start_date=wishlist.start_date,
            end_date=wishlist.end_date,
            date_type=wishlist.date_type,
            target_price=wishlist.target_price,
            budget=wishlist.budget,
            current_price=None,
            currency=wishlist.currency,
            is_active=True,
            status=TripStatus.PROCESSING,
            travelers_count=wishlist.travelers_count,
            adults=wishlist.adults,
            children=wishlist.children,
            preferences=wishlist.preferences,
            notes="🔍 Fiyatlar taranıyor...",
            itinerary_items=[],
        )
        document = wishlist_db.to_dict()

        if destination_lat and destination_lng:
            document["destination_lat"]  = destination_lat
            document["destination_lng"]  = destination_lng
        if destination_display:
            document["destination_display"] = destination_display
        if destination_country:
            document["destination_country"] = destination_country
        if destination_country_code:
            document["destination_country_code"] = destination_country_code
        _destination_iata_early = getattr(wishlist, "destination_iata", None)
        if _destination_iata_early:
            document["destination_iata"] = _destination_iata_early

        flexible_month    = getattr(wishlist, "flexible_month", None)
        flexible_duration = getattr(wishlist, "flexible_duration", None)
        if flexible_month:
            document["flexible_month"] = flexible_month
        if flexible_duration:
            document["flexible_duration"] = flexible_duration

        wishlist_id = await DatabaseManager.insert_one(COLLECTIONS["wishlists"], document)
        if not wishlist_id:
            raise HTTPException(status_code=500, detail="Wishlist oluşturulamadı")

        # Esnek tarih için start_date türet (flexible_month'tan)
        _start_date = wishlist.start_date
        if not _start_date and wishlist.date_type == "flexible" and wishlist.flexible_month:
            _month_num = {
                "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
                "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
            }.get((wishlist.flexible_month or "").lower()[:3], date.today().month)
            _today = date.today()
            _year  = _today.year if _month_num >= _today.month else _today.year + 1
            _start_date = date(_year, _month_num, 15)

        # Gece sayısı: fixed = tarih farkı, flexible = duration'a göre
        _dur = (getattr(wishlist, "flexible_duration", "") or "").lower().strip()
        if wishlist.start_date and wishlist.end_date:
            _nights = max(1, (wishlist.end_date - wishlist.start_date).days)
        elif _dur == "week":
            _nights = 7
        elif _dur == "3-5":
            _nights = 4
        else:
            _nights = 3  # "weekend" veya belirsiz

        _start_date_str = str(_start_date) if _start_date else None
        _return_date    = (
            str(_start_date + timedelta(days=_nights)) if _start_date else
            _calc_return_date(wishlist.start_date, wishlist.end_date,
                              getattr(wishlist.date_type, 'value', str(wishlist.date_type)),
                              _dur or None, _nights)
        )
        _destination_iata = getattr(wishlist, "destination_iata", None)
        _is_flexible      = wishlist.date_type == "flexible"

        if _is_flexible:
            # Esnek tarih: 3 senaryo paralel sorgula, en ucuzu seç
            logger.info(
                f"[CreateWishlist] Esnek tarih, FlexBest görevi ekleniyor | "
                f"id={wishlist_id} iata={_destination_iata} month={flexible_month} dur={flexible_duration}"
            )
            background_tasks.add_task(
                _fetch_flexible_best_deal,
                wishlist_id=wishlist_id,
                origin=wishlist.origin,
                destination=wishlist.destination,
                destination_iata=_destination_iata,
                flexible_month=flexible_month,
                flexible_duration=flexible_duration,
                total_budget=wishlist.budget or wishlist.target_price,
                guests=wishlist.adults or 1,
            )
        else:
            # Sabit tarih: doğrudan tek senaryo
            background_tasks.add_task(
                _fetch_travel_data,
                wishlist_id=wishlist_id,
                origin=wishlist.origin,
                destination=wishlist.destination,
                destination_iata=_destination_iata,
                start_date=_start_date_str,
                return_date=_return_date,
                nights=_nights,
                total_budget=wishlist.budget or wishlist.target_price,
                guests=wishlist.adults or 1,
            )

        background_tasks.add_task(
            _generate_and_save_ai_itinerary,
            wishlist_id=wishlist_id,
            destination=wishlist.destination,
            nights=_nights,
        )

        created = await WishlistService.find_one(wishlist_id)
        return WishlistResponse(**created)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veritabanı hatası: {str(e)}")


@router.post("/api/v1/wishlists", response_model=WishlistResponse, status_code=201, summary="Yeni seyahat planı oluştur")
async def create_wishlist(
    wishlist:         WishlistCreate,
    background_tasks: BackgroundTasks,
    current_user:     dict = Depends(get_current_user),
):
    return await _create_wishlist_impl(wishlist, background_tasks, current_user)



@router.post("/api/v1/wishlist/add", response_model=WishlistResponse, status_code=201, summary="Frontend compatible: wishlist ekle")
async def add_wishlist_api(
    wishlist:         WishlistCreate,
    background_tasks: BackgroundTasks,
    current_user:     dict = Depends(get_current_user),
):
    return await _create_wishlist_impl(wishlist, background_tasks, current_user)


@router.get("/api/v1/wishlists", response_model=None, summary="Tüm seyahat planlarını listele")
async def get_wishlists(
    status_filter: Optional[TripStatus] = None,
    is_active:     Optional[bool]       = None,
    limit: int = Query(default=100, le=500),
    skip:  int = Query(default=0,   ge=0),
    current_user: dict = Depends(get_optional_user),
):
    try:
        # Giriş yapılmamışsa boş döndür — kimliksiz erişim engellenir
        if not current_user:
            return []

        query = {}
        uid = current_user["user_id"]
        # uid hem string hem ObjectId olarak saklanmış olabilir → her ikisini de eşleştir
        uid_variants = [uid, str(uid)]
        try:
            if ObjectId.is_valid(uid):
                uid_variants.append(ObjectId(uid))
        except Exception:
            pass
        # Sadece bu kullanıcının planları — anonim/başkasına ait planlar HARİÇ
        query["user_id"] = {"$in": uid_variants}

        if status_filter:
            query["status"] = status_filter.value
        if is_active is not None:
            query["is_active"] = is_active

        wishlists = await WishlistService.find_all(query, skip, limit)
        result = []
        for w in wishlists:
            w.setdefault("origin",          "Unknown")
            w.setdefault("destination",     "Unknown")
            w.setdefault("date_type",       "fixed")
            w.setdefault("currency",        "TRY")
            w.setdefault("is_active",       True)
            w.setdefault("status",          "tracking")
            if w.get("status") not in ("processing", "tracking", "confirmed"):
                w["status"] = "tracking"
            w.setdefault("travelers_count", 1)
            w.setdefault("adults",          1)
            w.setdefault("children",        0)
            w.setdefault("preferences",     [])
            w.setdefault("itinerary_items", [])
            w.setdefault("current_price",   None)
            w.setdefault("scrape_status",   "pending")
            w.setdefault("trip_details",    None)
            w.setdefault("last_scraped_at", None)
            w.setdefault("created_at",      datetime.utcnow())
            w.setdefault("updated_at",      datetime.utcnow())
            # ObjectId → str (JSON serialization için)
            if "_id" in w:
                w["_id"] = str(w["_id"])
            result.append(w)
        # Pydantic model'den tamamen bağımsız — JSONResponse ile doğrudan döndür
        return JSONResponse(content=jsonable_encoder(result))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri getirme hatası: {str(e)}")



@router.delete("/api/v1/wishlists/{wishlist_id}", status_code=204, summary="Seyahat planını sil")
async def delete_wishlist(
    wishlist_id:  str  = Path(..., description="Silinecek Wishlist ID"),
    current_user: dict = Depends(get_current_user),
):
    try:
        if not ObjectId.is_valid(wishlist_id):
            raise HTTPException(status_code=400, detail="Geçersiz ID")
        wishlist = await WishlistService.find_one(wishlist_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Wishlist bulunamadı")
        if wishlist.get("user_id") and wishlist["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Sadece kendi planlarınızı silebilirsiniz")
        success = await WishlistService.delete(wishlist_id)
        if not success:
            raise HTTPException(status_code=404, detail="Wishlist silinemedi")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v1/planner/{wishlist_id}", response_model=PlannerResponse, summary="Smart Planner detaylarını döner")
async def get_planner_data(
    wishlist_id:  str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        if not ObjectId.is_valid(wishlist_id):
            raise HTTPException(status_code=400, detail="Geçersiz wishlist ID")
        wishlist = await WishlistService.find_one(wishlist_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Wishlist bulunamadı")
        if wishlist.get("user_id") and wishlist["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Bu plana erişim yetkiniz yok")

        itinerary  = wishlist.get("itinerary_items", [])
        flights    = [i for i in itinerary if i.get("item_type") == "flight"]
        hotels     = [i for i in itinerary if i.get("item_type") == "hotel"]
        activities = [i for i in itinerary if i.get("item_type") in ["activity", "restaurant", "transfer"]]

        if not flights:
            flights = [{"item_type": "flight", "provider": "Pegasus", "title": f"{wishlist.get('origin')} → {wishlist.get('destination')}", "price": wishlist.get("current_price") or 899, "currency": wishlist.get("currency", "TRY"), "is_selected": True, "flight_details": {"airline": "Pegasus", "departure_time": "06:30", "arrival_time": "07:45", "duration": "1h 15m"}}]
        if not hotels:
            hotels = [{"item_type": "hotel", "provider": "Booking.com", "title": f"{wishlist.get('destination')} Otel", "price": 2500, "currency": wishlist.get("currency", "TRY"), "is_selected": True, "hotel_details": {"hotel_name": "Sample Hotel", "stars": 4, "rating": 8.5}}]

        selected_flight = next((f for f in flights if f.get("is_selected")), flights[0] if flights else None)
        selected_hotel  = next((h for h in hotels  if h.get("is_selected")), hotels[0]  if hotels  else None)
        flight_price    = selected_flight.get("price", 0) if selected_flight else 0
        hotel_price     = selected_hotel.get("price",  0) if selected_hotel  else 0

        price_summary = {
            "flight_price":     flight_price,
            "hotel_price":      hotel_price,
            "activities_price": sum(a.get("price", 0) for a in activities if a.get("is_selected")),
            "total_price":      flight_price + hotel_price,
            "target_price":     wishlist.get("target_price", 0),
            "currency":         wishlist.get("currency", "TRY"),
        }
        price_summary["savings"] = price_summary["target_price"] - price_summary["total_price"]

        ai_suggestions = None
        try:
            ai_plan = await generate_null_plan(
                origin=wishlist.get("origin", ""),
                destination=wishlist.get("destination", ""),
                start_date=str(wishlist.get("start_date", "")),
                end_date=str(wishlist.get("end_date", "")),
                budget=wishlist.get("target_price", 0),
            )
            if ai_plan.success:
                ai_suggestions = {
                    "travel_tips":    ai_plan.travel_tips,
                    "best_time":      ai_plan.best_time_to_visit,
                    "local_insights": ai_plan.local_insights,
                }
        except Exception as _ai_err:
            logger.warning(f"[Planner] AI plan atlandı: {_ai_err}")

        last_scraped = wishlist.get("last_scraped_at")
        return PlannerResponse(
            id=wishlist["_id"],
            trip_name=wishlist.get("trip_name", ""),
            origin=wishlist.get("origin", ""),
            destination=wishlist.get("destination", ""),
            start_date=str(wishlist.get("start_date", "")),
            end_date=str(wishlist.get("end_date", "")),
            target_price=wishlist.get("target_price", 0),
            current_price=wishlist.get("current_price"),
            currency=wishlist.get("currency", "TRY"),
            is_active=wishlist.get("is_active", True),
            status=wishlist.get("status", "active"),
            travelers_count=wishlist.get("travelers_count", 1),
            flights=flights, hotels=hotels, activities=activities,
            price_summary=price_summary, ai_suggestions=ai_suggestions,
            trip_details=wishlist.get("trip_details"),
            last_scraped_at=str(last_scraped) if last_scraped else None,
            created_at=str(wishlist.get("created_at", datetime.utcnow())),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri getirme hatası: {str(e)}")



@router.get("/api/v1/plans/{plan_id}/details", response_model=PlanDetailsResponse, summary="Plan detaylarını döner")
async def get_plan_details(
    plan_id:      str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        if not ObjectId.is_valid(plan_id):
            raise HTTPException(status_code=400, detail="Geçersiz plan ID")
        wishlist = await WishlistService.find_one(plan_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Plan bulunamadı")
        if wishlist.get("user_id") and wishlist["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Bu plana erişim yetkiniz yok")

        trip_details: Dict[str, Any] = wishlist.get("trip_details") or {}
        nights      = trip_details.get("nights", 0)
        destination = wishlist.get("destination", "")
        origin    = wishlist.get("origin", "IST")
        dest_iata = wishlist.get("destination_iata", "")

        saved_itinerary = wishlist.get("ai_itinerary")
        if saved_itinerary and isinstance(saved_itinerary, list) and len(saved_itinerary) > 0:
            ai_day_plans = saved_itinerary
        else:
            ai_day_plans = generate_ai_day_plans(destination=destination, nights=nights or 4, origin=origin)

        # scrape_status: DB değerini önceliklendir (no_data, error vs.)
        scrape_status_field = wishlist.get("scrape_status", "pending")
        if scrape_status_field in ("no_data", "error"):
            scrape_status = scrape_status_field
        elif trip_details:
            scrape_status = "ready"
        else:
            scrape_status = "pending"

        # Uçuş linklerini her seferinde taze üret (DB'deki eski/bozuk link yerine)
        _start_raw = wishlist.get("start_date")
        _end_raw   = wishlist.get("end_date")
        _start = str(_start_raw)[:10] if _start_raw and str(_start_raw) != "None" else ""
        _end   = str(_end_raw)[:10]   if _end_raw   and str(_end_raw)   != "None" else ""

        outbound_flight = trip_details.get("outbound_flight")
        if outbound_flight and _start:
            _arr = dest_iata or outbound_flight.get("arrival_code", "")
            if origin and _arr and len(_start) >= 10:
                outbound_flight = {**outbound_flight, "link": _build_kiwi_search_link(origin, _arr, _start[:10])}

        return_flight = trip_details.get("return_flight")
        if return_flight and _end:
            _dep = dest_iata or return_flight.get("departure_code", "")
            if _dep and origin and len(_end) >= 10:
                return_flight = {**return_flight, "link": _build_kiwi_search_link(_dep, origin, _end[:10])}

        last_scraped = wishlist.get("last_scraped_at") or trip_details.get("scraped_at")
        return PlanDetailsResponse(
            plan_id=plan_id,
            trip_name=wishlist.get("trip_name"),
            origin=origin,
            destination=destination,
            start_date=_start or None,
            end_date=_end or None,
            image_url=wishlist.get("image_url"),
            trip_type=trip_details.get("trip_type", "bireysel"),
            nights=nights,
            budget=wishlist.get("budget") or wishlist.get("target_price"),
            outbound_flight=outbound_flight,
            return_flight=return_flight,
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


@router.post("/api/v1/plans/{plan_id}/retry-scrape", summary="Başarısız plan için uçuş/otel taramasını yeniden başlat")
async def retry_plan_scrape(
    plan_id:          str  = Path(...),
    background_tasks: BackgroundTasks = None,
    current_user:     dict = Depends(get_current_user),
):
    """Scrape_status 'no_data' veya 'error' olan planlar için taramayı yeniden tetikler."""
    try:
        if not ObjectId.is_valid(plan_id):
            raise HTTPException(status_code=400, detail="Geçersiz plan ID")
        wishlist = await WishlistService.find_one(plan_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Plan bulunamadı")
        if wishlist.get("user_id") and wishlist["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Bu plana erişim yetkiniz yok")

        origin      = wishlist.get("origin", "IST")
        destination = wishlist.get("destination", "")
        date_type   = wishlist.get("date_type", "flexible")

        # IATA: DB'den al; yoksa _IATA_DISPLAY reverse map ile dene
        dest_iata   = wishlist.get("destination_iata")
        if not dest_iata:
            _rev = {v.lower(): k for k, v in _IATA_DISPLAY.items()}
            dest_iata = _rev.get(destination.lower().split(",")[0].strip())

        # Tarihler
        start_dt  = wishlist.get("start_date")
        end_dt    = wishlist.get("end_date")
        flex_month = wishlist.get("flexible_month")
        flex_dur   = wishlist.get("flexible_duration", "weekend")
        budget     = wishlist.get("budget") or wishlist.get("target_price")
        guests     = wishlist.get("adults") or 1

        _dur_lower = (flex_dur or "").lower().strip()
        _nights    = 7 if _dur_lower == "week" else (4 if _dur_lower == "3-5" else 3)
        if start_dt and end_dt:
            try:
                _nights = max(1, (end_dt - start_dt).days)
            except Exception:
                pass

        # scrape_status'u sıfırla
        await DatabaseManager.update_one(
            COLLECTIONS["wishlists"], plan_id,
            {"scrape_status": "pending", "notes": "🔍 Yeniden taranıyor...", "status": "processing"},
        )

        _is_flex = str(date_type) in ("flexible", "DateType.FLEXIBLE")
        if _is_flex:
            background_tasks.add_task(
                _fetch_flexible_best_deal,
                wishlist_id=plan_id,
                origin=origin,
                destination=destination,
                destination_iata=dest_iata,
                flexible_month=flex_month,
                flexible_duration=flex_dur,
                total_budget=budget,
                guests=guests,
            )
        else:
            start_str = str(start_dt) if start_dt else None
            end_str   = str(end_dt)   if end_dt   else None
            background_tasks.add_task(
                _fetch_travel_data,
                wishlist_id=plan_id,
                origin=origin,
                destination=destination,
                destination_iata=dest_iata,
                start_date=start_str,
                return_date=end_str,
                nights=_nights,
                total_budget=budget,
                guests=guests,
            )

        return {"status": "ok", "message": "Tarama yeniden başlatıldı"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retry hatası: {str(e)}")


@router.get("/api/v1/plans/{plan_id}/budget", response_model=BudgetCalculateResponse, summary="Seçili otele göre bütçe hesapla")
async def calculate_plan_budget(
    plan_id:      str  = Path(...),
    hotel_index:  int  = Query(default=0, ge=0, le=2),
    current_user: dict = Depends(get_current_user),
):
    try:
        if not ObjectId.is_valid(plan_id):
            raise HTTPException(status_code=400, detail="Geçersiz plan ID")
        wishlist = await WishlistService.find_one(plan_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Plan bulunamadı")
        if wishlist.get("user_id") and wishlist["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Bu plana erişim yetkiniz yok")

        trip_details:  Dict[str, Any] = wishlist.get("trip_details") or {}
        hotel_options: list            = trip_details.get("hotel_options", [])
        if hotel_index >= len(hotel_options):
            hotel_index = 0

        outbound    = trip_details.get("outbound_flight") or {}
        return_f    = trip_details.get("return_flight") or {}
        flight_cost = float(outbound.get("price", 0)) + float(return_f.get("price", 0))
        hotel: Dict[str, Any] = hotel_options[hotel_index] if hotel_options else {}
        hotel_cost  = float(hotel.get("total_price", 0))
        hotel_name  = hotel.get("hotel_name")
        currency    = hotel.get("currency", outbound.get("currency", "TRY"))
        total_cost  = flight_cost + hotel_cost

        target_budget = wishlist.get("budget") or ((trip_details.get("budget_summary") or {}).get("target_budget"))

        usage_pct = round(total_cost / target_budget * 100, 1) if target_budget else None
        if not target_budget:
            rec = {"label": "en-iyi-teklif", "label_text": "En İyi Teklif",          "label_icon": "🎯", "usage_percent": None}
        elif total_cost <= target_budget * 0.70:
            rec = {"label": "super-firsat",  "label_text": "Süper Fırsat",            "label_icon": "🔥", "usage_percent": usage_pct}
        elif total_cost <= target_budget:
            rec = {"label": "butce-uygun",   "label_text": "Bütçene Uygun",           "label_icon": "✅", "usage_percent": usage_pct}
        elif total_cost <= target_budget * 1.10:
            rec = {"label": "biraz-asim",    "label_text": "Bütçeni Biraz Aşıyor",    "label_icon": "⚠️", "usage_percent": usage_pct}
        else:
            rec = {"label": "butce-disi",    "label_text": "Bütçe Dışı",              "label_icon": "❌", "usage_percent": usage_pct}
        savings  = None
        overage  = None
        if target_budget:
            diff = total_cost - target_budget
            if diff < 0:
                savings = abs(diff)
            else:
                overage = diff

        return BudgetCalculateResponse(
            plan_id=plan_id, selected_hotel_index=hotel_index,
            hotel_name=hotel_name, flight_cost=flight_cost,
            hotel_cost=hotel_cost, total_cost=total_cost,
            currency=currency, label=rec.get("label", "en-iyi-teklif"),
            label_text=rec.get("label_text", "En İyi Teklif"),
            label_icon=rec.get("label_icon", "🎯"),
            savings=savings, overage=overage,
            usage_percent=rec.get("usage_percent"),
            target_budget=target_budget,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bütçe hesaplama hatası: {str(e)}")


@router.post("/api/v1/plans/{plan_id}/seed-mock", summary="Plana demo trip_details verisi yaz")
async def seed_mock_plan(
    plan_id:      str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(plan_id):
        raise HTTPException(status_code=400, detail="Geçersiz plan ID")
    wishlist = await WishlistService.find_one(plan_id)
    if not wishlist:
        raise HTTPException(status_code=404, detail="Plan bulunamadı")
    if wishlist.get("user_id") and wishlist["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Bu plana erişim yetkiniz yok")

    origin      = wishlist.get("origin", "IST")
    nights      = 4
    mock_trip: Dict[str, Any] = {
        "trip_type": "bireysel",
        "outbound_flight": {"departure_code": origin, "arrival_code": "CDG", "departure_city": "İstanbul Airport", "arrival_city": "Charles de Gaulle", "departure_time": "08:30", "arrival_time": "11:00", "duration": "3s 30dk", "stops": 0, "airline": "TK", "airline_logo_url": "https://content.airhex.com/content/logos/airlines_TK_35_35_t.png", "flight_number": "TK1805", "price": 4500.0, "currency": "TRY", "cabin_class": "economy"},
        "return_flight": {"departure_code": "CDG", "arrival_code": origin, "departure_city": "Charles de Gaulle", "arrival_city": "İstanbul Airport", "departure_time": "15:00", "arrival_time": "19:30", "duration": "3s 30dk", "stops": 0, "airline": "TK", "airline_logo_url": "https://content.airhex.com/content/logos/airlines_TK_35_35_t.png", "flight_number": "TK1806", "price": 4500.0, "currency": "TRY", "cabin_class": "economy"},
        "hotel_options": [
            {"hotel_name": "Hotel Le Plume", "stars": 4, "rating": 8.7, "image_url": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&q=80", "address": "Saint-Germain-des-Prés, Paris", "price_per_night": 1250.0, "total_price": 5000.0, "currency": "TRY", "nights": nights, "room_type": "Deluxe Oda", "amenities": ["WiFi", "Kahvaltı"], "provider": "trivago", "is_recommended": True},
            {"hotel_name": "Hôtel de la Paix", "stars": 3, "rating": 7.9, "image_url": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=600&q=80", "address": "Le Marais, Paris", "price_per_night": 900.0, "total_price": 3600.0, "currency": "TRY", "nights": nights, "room_type": "Standard Oda", "amenities": ["WiFi"], "provider": "trivago", "is_recommended": False},
            {"hotel_name": "Palais Royal Grand", "stars": 5, "rating": 9.2, "image_url": "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80", "address": "1er Arrondissement, Paris", "price_per_night": 2500.0, "total_price": 10000.0, "currency": "TRY", "nights": nights, "room_type": "Suite", "amenities": ["WiFi", "Spa", "Restoran"], "provider": "trivago", "is_recommended": False},
        ],
        "selected_hotel_index": 0,
        "budget_summary": {"target_budget": wishlist.get("budget") or 17000.0, "flight_cost": 9000.0, "hotel_cost": 5000.0, "total_cost": 14000.0, "currency": "TRY", "label": "tam-butce", "label_text": "Tam Bütçene Göre", "label_icon": "✅", "savings": 3000.0, "overage": None, "usage_percent": 82.4},
        "nights": nights, "ai_day_plans": [], "scraped_at": datetime.utcnow().isoformat(), "scrape_provider": "mock",
    }
    await DatabaseManager.update_one(COLLECTIONS["wishlists"], plan_id, {"trip_details": mock_trip, "scrape_status": "ready"})
    return {"ok": True, "plan_id": plan_id, "message": "Mock trip_details zimbalandi!"}


@router.post("/api/v1/plans/{plan_id}/confirm", summary="Planı onayla")
async def confirm_plan(
    plan_id:      str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(plan_id):
        raise HTTPException(status_code=400, detail="Geçersiz plan ID")
    wishlist = await WishlistService.find_one(plan_id)
    if not wishlist:
        raise HTTPException(status_code=404, detail="Plan bulunamadı")
    if wishlist.get("user_id") and wishlist["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Bu plana erişim yetkiniz yok")
    await DatabaseManager.update_one(COLLECTIONS["wishlists"], plan_id, {"status": TripStatus.CONFIRMED.value})
    return {"ok": True, "plan_id": plan_id, "status": TripStatus.CONFIRMED.value, "message": "Plan onaylandı! Hayırlı yolculuklar."}


@router.post("/api/v1/trigger-scrape/{wishlist_id}", response_model=ScrapeResponse, summary="Manuel fiyat taraması başlat")
async def trigger_scrape(
    wishlist_id:  str  = Path(...),
    provider:     str  = Query(default="enuygun"),
    current_user: dict = Depends(get_current_user),
):
    try:
        if not ObjectId.is_valid(wishlist_id):
            raise HTTPException(status_code=400, detail="Geçersiz ID")
        wishlist = await WishlistService.find_one(wishlist_id)
        if not wishlist:
            raise HTTPException(status_code=404, detail="Wishlist bulunamadı")
        return ScrapeResponse(success=False, wishlist_id=wishlist_id, current_price=None, provider=provider, message="Scraper pasif modda - Veri akış yolu hazır", scraped_at=datetime.utcnow())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")



@router.get("/api/v1/debug/kiwi-test", summary="Kiwi API'yi doğrudan test et")
async def debug_kiwi_test(
    origin:       str  = Query(default="IST"),
    dest:         str  = Query(default="LHR"),
    dep_date:     str  = Query(default="2026-05-02"),
    current_user: dict = Depends(get_current_user),
):
    """Kiwi one-way ve round-trip endpointlerini test eder. Tarayıcıdan: /api/v1/debug/kiwi-test"""
    import httpx as _httpx
    import os as _os
    rapidapi_key = _os.getenv("RAPIDAPI_KEY", "")
    kiwi_host    = _os.getenv("KIWI_HOST", "")
    params = {
        "source":           f"Airport:{origin}",
        "destination":      f"Airport:{dest}",
        "currency":         "usd",
        "locale":           "en",
        "adults":           1,
        "children":         0, "infants": 0,
        "handbags":         1, "holdbags": 0,
        "cabinClass":       "ECONOMY",
        "sortBy":           "PRICE",
        "sortOrder":        "ASCENDING",
        "transportTypes":   "FLIGHT",
        "contentProviders": "FRESH,KIWI,KAYAK",
        "limit":            5,
        "dateFrom":         dep_date,
        "dateTo":           dep_date,
    }
    results = {}
    for ep in ("one-way", "round-trip"):
        try:
            async with _httpx.AsyncClient(
                headers={"x-rapidapi-key": rapidapi_key, "x-rapidapi-host": kiwi_host},
                timeout=_httpx.Timeout(20.0),
            ) as client:
                r = await client.get(f"https://{kiwi_host}/{ep}", params=params)
            if r.status_code == 200:
                body = r.json()
                itin = body.get("itineraries") or []
                results[ep] = {
                    "status": 200,
                    "itinerary_count": len(itin),
                    "body_keys": list(body.keys()),
                    "sample": itin[:1],
                }
            else:
                results[ep] = {"status": r.status_code, "body": r.text[:400]}
        except Exception as e:
            results[ep] = {"exception": str(e)}
    return {
        "origin": origin, "dest": dest, "dep_date": dep_date,
        "kiwi_host": kiwi_host, "has_key": bool(rapidapi_key),
        "results": results,
    }


# ============================================================================
#               SCHEDULER JOB — her 4 saatte bir çalışır
# ============================================================================

async def rescrape_active_plans():
    """Her 4 saatte bir tüm aktif planları yeniden tarar. main.py'deki APScheduler çağırır."""
    logger.info("[Scheduler] 4 saatlik rescrape başlıyor...")
    try:
        plans = await WishlistService.find_all(
            {"is_active": True, "status": {"$in": ["tracking", "processing"]}},
            skip=0,
            limit=500,
        )
        logger.info(f"[Scheduler] {len(plans)} aktif plan bulundu.")
        for plan in plans:
            plan_id = plan.get("_id")
            if not plan_id:
                continue
            try:
                start_d = plan.get("start_date")
                end_d   = plan.get("end_date")
                try:
                    nights = max(1, (end_d - start_d).days) if (start_d and end_d) else 3
                except Exception:
                    nights = 3

                if plan.get("date_type") == "flexible":
                    await _fetch_flexible_best_deal(
                        wishlist_id=str(plan_id),
                        origin=plan.get("origin", "IST"),
                        destination=plan.get("destination", ""),
                        destination_iata=plan.get("destination_iata"),
                        flexible_month=plan.get("flexible_month"),
                        flexible_duration=plan.get("flexible_duration"),
                        total_budget=plan.get("budget") or plan.get("target_price"),
                        guests=plan.get("adults", 1),
                    )
                else:
                    await _fetch_travel_data(
                        wishlist_id=str(plan_id),
                        origin=plan.get("origin", "IST"),
                        destination=plan.get("destination", ""),
                        destination_iata=plan.get("destination_iata"),
                        start_date=str(start_d) if start_d else None,
                        return_date=str(end_d) if end_d else None,
                        nights=nights,
                        total_budget=plan.get("budget") or plan.get("target_price"),
                        guests=plan.get("adults", 1),
                    )
                logger.info(f"[Scheduler] Plan {plan_id} yeniden tarandı.")
            except Exception as e:
                logger.warning(f"[Scheduler] Plan {plan_id} tarama hatası: {e}")
    except Exception as e:
        logger.error(f"[Scheduler] rescrape_active_plans genel hata: {e}")
