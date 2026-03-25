"""
PLANİGO - AI Router
Gemini AI seyahat önerisi ve itinerary endpoint'leri.
Extracted from main.py lines 214-303.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from auth import get_current_user
from database import WishlistService
from gemini import fetchTravelRecommendations, generate_pax_itinerary

router = APIRouter(tags=["AI"])


@router.get(
    "/api/v1/ai/travel-recommendations",
    summary="Gemini AI ile sehir icin seyahat onerileri getir",
)
async def get_travel_recommendations(
    city:         str  = Query(..., min_length=1, max_length=100, description="Onerilerin istendigi sehir adi"),
    current_user: dict = Depends(get_current_user),
):
    result = await fetchTravelRecommendations(city)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "AI servisi yanit vermedi"))
    return result


@router.get(
    "/api/v1/ai/pax-itinerary",
    summary="Gemini 2.0 Flash ile gun gun seyahat plani olustur",
)
async def get_pax_itinerary(
    city:         str  = Query(..., min_length=1, max_length=100, description="Seyahat edilecek sehir"),
    days:         int  = Query(default=3, ge=1, le=14, description="Plan suresi (1-14 gun)"),
    current_user: dict = Depends(get_current_user),
):
    result = await generate_pax_itinerary(city=city, days=days)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "AI servisi yanit vermedi"))
    return result


@router.get("/api/v1/plans/{plan_id}/ai-recommendations", summary="Plan icin Gemini AI gun plani")
async def get_plan_ai_recommendations(
    plan_id:      str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        from bson import ObjectId
        ObjectId(plan_id)
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

    city_clean = destination.split(",")[0].strip() or destination
    result = await generate_pax_itinerary(city=city_clean, days=max(1, min(nights, 14)))
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "AI servisi yanit vermedi"))
    return result


