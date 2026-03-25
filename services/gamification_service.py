"""
PLANİGO - Gamification Service
XP engine, level calculation, and badge award logic.
Extracted from main.py lines 3001-3121.
"""

from collections import Counter
from datetime import datetime

from bson import ObjectId

from database import DatabaseManager, COLLECTIONS

# ── Constants ─────────────────────────────────────────────────────────────────

XP_PER_LEVEL = 100

EU_COUNTRIES = {
    "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI",
    "FR","GR","HR","HU","IE","IT","LT","LU","LV","MT",
    "NL","PL","PT","RO","SE","SI","SK"
}

VISA_FREE_COUNTRIES = {
    "AL","AZ","BA","BY","BR","BO","CL","CO","EC","GE",
    "HT","HK","ID","IR","JO","KZ","XK","KG","LB","LY",
    "MD","MN","ME","MA","NI","MK","OM","PK","PY","QA",
    "SN","RS","KR","TJ","TN","TM","UA","UY","UZ","TR",
    "AF","AM","MO","MV","NP","SC","ZW","VN","ET","UG",
}

BADGE_DEFINITIONS = [
    {"id": "euro_traveler",  "name": "Euro Traveler",  "icon": "🇪🇺", "description": "5 Avrupa Birliği ülkesi gez",              "condition": "eu_countries >= 5"},
    {"id": "schengen_ghost", "name": "Schengen Ghost", "icon": "👻",  "description": "Vizesiz 5 ülke gez",                        "condition": "visa_free_countries >= 5"},
    {"id": "photo_genic",    "name": "Photo Genic",    "icon": "📸",  "description": "Haritaya 5 farklı pin bırak",               "condition": "pins >= 5"},
    {"id": "city_guide",     "name": "City Guide",     "icon": "🗺",  "description": "Tek bir şehre 5+ pin ekle",                 "condition": "city_pins >= 5"},
    {"id": "early_bird",     "name": "Early Bird",     "icon": "🐦",  "description": "PLANİGO'nun ilk 5000 kullanıcısından biri", "condition": "early_bird"},
    {"id": "passport_full",  "name": "Passport Full",  "icon": "📒",  "description": "50+ pasaport damgası topla",                "condition": "countries >= 50"},
]


# ── Core Engine ───────────────────────────────────────────────────────────────

async def award_xp_and_badges(user_id: str, delta: int) -> dict:
    """
    Adds or subtracts XP, recalculates level, and checks badge conditions.

    Returns:
        {xp, level, leveled_up, old_level, xp_progress, xp_to_next, new_badges, all_badges, delta}
        Empty dict on error or unknown user.
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

        # Badge context
        existing_badge_ids = {b["id"] if isinstance(b, dict) else b for b in user.get("badges", [])}
        visited_list   = user.get("visited_countries", [])
        visited_count  = len(visited_list)
        wishlist_count = user.get("wishlist_count", 0)

        # Adjust counts based on delta context
        if delta == 100:  visited_count  += 1
        if delta == -100: visited_count  -= 1
        if delta == 20:   wishlist_count += 1
        if delta == -20:  wishlist_count = max(0, wishlist_count - 1)

        def _country_codes(vl):
            codes = set()
            for vc in vl:
                code = (vc if isinstance(vc, str) else vc.get("country_code", "")).upper()
                if code:
                    codes.add(code)
            return codes

        visited_codes   = _country_codes(visited_list)
        eu_count        = len(visited_codes & EU_COUNTRIES)
        visa_free_count = len(visited_codes & VISA_FREE_COUNTRIES)

        pins_col     = DatabaseManager.get_collection(COLLECTIONS["pins"])
        user_pins    = await pins_col.find({"creator_id": user_id}).to_list(length=500)
        pin_count    = len(user_pins)
        city_pin_max = 0
        if user_pins:
            city_counts  = Counter(
                (p.get("city") or p.get("location") or "").strip().lower()
                for p in user_pins if (p.get("city") or p.get("location") or "").strip()
            )
            city_pin_max = max(city_counts.values()) if city_counts else 0

        users_before  = await collection.count_documents({"_id": {"$lt": ObjectId(user_id)}})
        is_early_bird = users_before < 5000

        new_badges = []
        all_badges = []
        for bd in BADGE_DEFINITIONS:
            bid      = bd["id"]
            unlocked = bid in existing_badge_ids
            if not unlocked:
                cond   = bd["condition"]
                earned = (
                    (cond == "wishlists >= 1"           and wishlist_count   >= 1)  or
                    (cond == "wishlists >= 10"          and wishlist_count   >= 10) or
                    (cond == "countries >= 1"           and visited_count    >= 1)  or
                    (cond == "countries >= 5"           and visited_count    >= 5)  or
                    (cond == "countries >= 50"          and visited_count    >= 50) or
                    (cond == "eu_countries >= 5"        and eu_count         >= 5)  or
                    (cond == "visa_free_countries >= 5" and visa_free_count  >= 5)  or
                    (cond == "pins >= 5"                and pin_count        >= 5)  or
                    (cond == "city_pins >= 5"           and city_pin_max     >= 5)  or
                    (cond == "level >= 5"               and new_level        >= 5)  or
                    (cond == "early_bird"               and is_early_bird)
                )
                if earned:
                    new_badges.append(bd)
                    all_badges.append({**bd, "unlocked": True, "earned_at": datetime.utcnow().isoformat()})
                else:
                    all_badges.append({**bd, "unlocked": False})
            else:
                existing = next(
                    (b for b in user.get("badges", []) if (b.get("id") if isinstance(b, dict) else b) == bid),
                    None
                )
                all_badges.append({**bd, "unlocked": True, **(existing if isinstance(existing, dict) else {})})

        await collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"xp": new_xp, "level": new_level, "badges": all_badges}}
        )

        return {
            "xp":         new_xp,
            "level":      new_level,
            "leveled_up": leveled_up,
            "old_level":  old_level,
            "xp_progress": new_xp % XP_PER_LEVEL,
            "xp_to_next":  XP_PER_LEVEL - (new_xp % XP_PER_LEVEL),
            "new_badges":  new_badges,
            "all_badges":  all_badges,
            "delta":       delta,
        }
    except Exception as e:
        print(f"XP award error: {e}")
        return {}
