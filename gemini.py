"""
Gemini AI — PAX Travel Intelligence Module
API key is read from GEMINI_API_KEY env variable (never hardcoded).
"""

import os
import re
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

_api_key = os.environ.get("GEMINI_API_KEY", "")
_ready   = bool(_api_key and _api_key != "your_gemini_api_key_here")
_client  = genai.Client(api_key=_api_key) if _ready else None

# Model priority list: newest first, fallback on quota exhaustion
_MODELS = ("gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-1.5-flash")


# ── Prompt builder ─────────────────────────────────────────────────────────────
def _build_itinerary_prompt(city: str, days: int) -> str:
    """
    Builds the dynamic user prompt sent to Gemini.
    Explicitly states day count, budget-friendly focus, and pure JSON output.
    """
    return (
        f"{city} sehri icin tam {days} gunluk seyahat plani olustur. "
        f"Her gun icin MUTLAKA 1 turistik yer (location) ve 1 yerel yemek/icecek (food) sec. "
        f"Her alan dolu olmali — hicbir alan bos birakma. "
        f"Yaniti YALNIZCA asagidaki JSON formatinda ver, baska hicbir sey yazma.\n\n"
        f"ZORUNLU JSON formati (tam {days} eleman, hepsi dolu):\n"
        f'{{\n'
        f'  "city": "{city}",\n'
        f'  "days": {days},\n'
        f'  "itinerary": [\n'
        f'    {{\n'
        f'      "day": 1,\n'
        f'      "location": "{city} turistik yeri",\n'
        f'      "loc_img_query": "2-4 English keywords for Unsplash photo (e.g. Senso-ji Temple Asakusa)",\n'
        f'      "loc_desc": "Bu yerin 1-2 cumlelik aciklamasi",\n'
        f'      "food": "Yerel yemek veya icecek adi",\n'
        f'      "food_img_query": "2-3 English keywords for food photo (e.g. Taiyaki Japanese pastry)",\n'
        f'      "food_desc": "Bu yemegin 1 cumlelik aciklamasi"\n'
        f'    }}\n'
        f'  ]\n'
        f'}}'
    )


_ITINERARY_SYSTEM = (
    "Sen PAX adli bir seyahat asistanisin. "
    "Kullaniciya her gun icin TAM OLARAK 1 turistik lokasyon ve 1 yerel yemek/icecek oner. "
    "Sadece butce dostu ve cok ziyaret edilen yerleri sec. "
    "Her gun icin loc_img_query ve food_img_query alanlarini MUTLAKA doldur — "
    "bunlar Unsplash'te fotografini bulmak icin kullanilan kisa Ingilizce anahtar kelimelerdir. "
    "Yaniti YALNIZCA ham JSON formatinda ver — hicbir markdown, kod blogu veya aciklama ekleme."
)


# ── Markdown / noise cleaner ──────────────────────────────────────────────────
def _clean_json(raw: str) -> str:
    """
    Strips all non-JSON wrapping from Gemini output:
      - ```json ... ``` fences
      - ``` ... ``` fences
      - Leading/trailing whitespace and stray characters before '{'
    """
    raw = raw.strip()

    # Remove ```json ... ``` or ``` ... ``` fences
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'\s*```$', '', raw)
    raw = raw.strip()

    # If there's still garbage before the first '{', slice it off
    first_brace = raw.find('{')
    if first_brace > 0:
        raw = raw[first_brace:]

    # Trim anything after the last '}'
    last_brace = raw.rfind('}')
    if last_brace != -1 and last_brace < len(raw) - 1:
        raw = raw[:last_brace + 1]

    return raw


# ── Core Gemini caller ────────────────────────────────────────────────────────
async def _call_gemini(prompt: str, system: str = "", max_tokens: int = 4096) -> str:
    """
    Calls Gemini with model fallback chain.
    Returns clean JSON string ready for json.loads().
    """
    cfg = types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.7,
        max_output_tokens=max_tokens,
        system_instruction=system or None,
    )

    last_error = None
    for model_id in _MODELS:
        try:
            response = await _client.aio.models.generate_content(
                model=model_id,
                contents=prompt,
                config=cfg,
            )
            raw = response.text or ""
            return _clean_json(raw)

        except Exception as err:
            last_error = err
            err_str = str(err)
            # Retry with next model only on quota/rate errors
            if any(k in err_str for k in ("RESOURCE_EXHAUSTED", "429", "quota")):
                continue
            raise  # Any other error → fail immediately

    raise last_error  # All models exhausted


# ── Day-count enforcer ────────────────────────────────────────────────────────
def _enforce_day_count(data: dict, city: str, days: int) -> dict:
    """
    Guarantees exactly `days` entries in the itinerary array.
    Trims extras or pads with placeholders if Gemini drifts.
    """
    itinerary = data.get("itinerary", [])

    # Trim if too many
    itinerary = itinerary[:days]

    # Pad if too few
    existing_days = {d["day"] for d in itinerary if isinstance(d.get("day"), int)}
    for d in range(1, days + 1):
        if d not in existing_days:
            itinerary.append({
                "day": d,
                "location": f"{city} merkezi",
                "loc_desc": f"{city} sehrini kesfet.",
                "food": f"{city} mutfagi",
                "food_desc": "Yoreye ozgu lezzetleri dene."
            })

    # Normalize existing entries: fill missing/empty fields
    for entry in itinerary:
        if not entry.get("location"):
            entry["location"] = f"{city} merkezi"
        if not entry.get("loc_desc"):
            entry["loc_desc"] = f"{city} sehrini kesfet."
        if not entry.get("food"):
            entry["food"] = f"{city} mutfagi"
        if not entry.get("food_desc"):
            entry["food_desc"] = "Yoreye ozgu lezzetleri dene."

    # Re-sort by day number
    itinerary.sort(key=lambda x: x.get("day", 99))

    data["itinerary"] = itinerary
    data["city"]      = city
    data["days"]      = days
    return data


# ── Public: itinerary ─────────────────────────────────────────────────────────
async def generate_pax_itinerary(city: str, days: int) -> dict:
    """
    Generates a day-by-day PAX itinerary.
    Guaranteed to return exactly `days` entries.
    """
    if not _ready or not _client:
        return _mock_itinerary(city, days)

    try:
        prompt   = _build_itinerary_prompt(city, days)
        # Scale tokens: thinking model needs extra headroom
        tokens   = max(4096, days * 512)
        raw      = await _call_gemini(prompt, system=_ITINERARY_SYSTEM, max_tokens=tokens)
        data     = json.loads(raw)

        if "itinerary" not in data or not isinstance(data["itinerary"], list):
            raise ValueError("itinerary field missing or not a list")

        data = _enforce_day_count(data, city, days)
        return {"success": True, "data": data}

    except json.JSONDecodeError as e:
        return {"success": False, "error": f"JSON parse hatasi: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Public: city overview ─────────────────────────────────────────────────────
_OVERVIEW_PROMPT = """
Sen bir seyahat asistanisin. Kullanici "{city}" sehrini ziyaret etmek istiyor.
Asagidaki formatta SADECE gecerli JSON don:

{{
  "city": "{city}",
  "summary": "2-3 cumlelik kisa sehir ozeti",
  "best_time": "En iyi ziyaret zamani",
  "highlights": [
    {{"name": "yer adi", "type": "attraction|food|nature|culture", "tip": "kisa ipucu"}},
    {{"name": "yer adi", "type": "attraction|food|nature|culture", "tip": "kisa ipucu"}},
    {{"name": "yer adi", "type": "attraction|food|nature|culture", "tip": "kisa ipucu"}},
    {{"name": "yer adi", "type": "attraction|food|nature|culture", "tip": "kisa ipucu"}},
    {{"name": "yer adi", "type": "attraction|food|nature|culture", "tip": "kisa ipucu"}}
  ],
  "local_food": ["yemek 1", "yemek 2", "yemek 3"],
  "budget_tip": "Butce dostu bir ipucu",
  "hidden_gem": "Az bilinen ama mutlaka gorulmesi gereken bir yer"
}}
"""


async def fetchTravelRecommendations(city: str) -> dict:
    """Quick city overview: highlights, food, hidden gem."""
    if not _ready or not _client:
        return _mock_overview(city)
    try:
        raw  = await _call_gemini(_OVERVIEW_PROMPT.format(city=city))
        data = json.loads(raw)
        return {"success": True, "data": data}
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"JSON parse hatasi: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Mock fallbacks ────────────────────────────────────────────────────────────
def _mock_itinerary(city: str, days: int) -> dict:
    return {
        "success": True,
        "data": {
            "city": city,
            "days": days,
            "itinerary": [
                {
                    "day": d,
                    "location": f"{city} Merkezi",
                    "loc_desc": "GEMINI_API_KEY eklendiginde gercek oneriler gelecek.",
                    "food": "Yerel Mutfak",
                    "food_desc": "API anahtari eklendikten sonra gercek yemek onerisi gorunecek."
                }
                for d in range(1, days + 1)
            ]
        },
        "_mock": True
    }


def _mock_overview(city: str) -> dict:
    return {
        "success": True,
        "data": {
            "city": city,
            "summary": f"{city} icin oneriler almak uzere GEMINI_API_KEY ekleyin.",
            "best_time": "Bilgi mevcut degil",
            "highlights": [{"name": "Merkez", "type": "attraction", "tip": "Sehri kesfet"}],
            "local_food": ["Yerel mutfak"],
            "budget_tip": "API anahtari eklendikten sonra gercek oneriler gorunecek",
            "hidden_gem": "Yakin zamanda eklenecek"
        },
        "_mock": True
    }
