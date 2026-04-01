"""
PLANİGO - Pins Router
Harita pin CRUD endpoint'leri.
Extracted from main.py lines 200-409.
"""

from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, status

from auth import get_current_user
from database import DatabaseManager, PinService, COLLECTIONS
from models import MapPinCreate, MapPinInDB, MapPinResponse, MapPinType

router = APIRouter(prefix="/api/v1/map/pins", tags=["Social Map"])


@router.get("", response_model=List[MapPinResponse], summary="Haritadaki tüm sosyal noktaları getirir")
async def get_map_pins(
    pin_type: Optional[MapPinType] = None,
    city:     Optional[str]        = None,
    country:  Optional[str]        = None,
    limit:    int = Query(default=100, le=500),
    skip:     int = Query(default=0, ge=0),
):
    try:
        query = {}
        if pin_type:
            query["type"] = pin_type.value
        if city:
            query["city"] = city
        if country:
            query["country"] = country
        pins = await PinService.find_all(query, skip, limit)
        result = []
        for pin in pins:
            pin["tips_count"] = len(pin.get("user_tips", []))
            result.append(MapPinResponse(**pin))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri getirme hatası: {str(e)}")


@router.post("", response_model=MapPinResponse, status_code=201, summary="Yeni konum pini ekle")
async def create_map_pin(
    pin:          MapPinCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        pin_data = pin.model_dump()
        pin_data["user_id"] = current_user["user_id"]  # JWT'den override
        pin_db   = MapPinInDB(**pin_data, user_tips=[])
        document = pin_db.to_dict()
        pin_id   = await DatabaseManager.insert_one(COLLECTIONS["pins"], document)
        if not pin_id:
            raise HTTPException(status_code=500, detail="Pin oluşturulamadı")
        created_pin = await PinService.find_one(pin_id)
        created_pin["tips_count"] = 0
        return MapPinResponse(**created_pin)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veritabanı hatası: {str(e)}")


@router.get("/nearby", response_model=List[MapPinResponse], summary="Yakındaki pinleri getir")
async def get_nearby_pins(
    lat:       float = Query(..., ge=-90, le=90),
    lng:       float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=10, ge=1, le=100),
):
    try:
        pins = await PinService.find_nearby(lat, lng, radius_km)
        result = []
        for pin in pins:
            pin["tips_count"] = len(pin.get("user_tips", []))
            result.append(MapPinResponse(**pin))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri getirme hatası: {str(e)}")


@router.patch("/{pin_id}", summary="Konum pinini güncelle (sadece oluşturan kullanıcı)")
async def update_map_pin(
    pin_id:       str  = Path(..., description="Güncellenecek pin'in ObjectId'si"),
    data:         dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(pin_id):
        raise HTTPException(status_code=400, detail="Geçersiz pin ID")
    pin = await PinService.find_one(pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin bulunamadı")
    if pin.get("user_id") and pin["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Sadece oluşturan kullanıcı düzenleyebilir")

    allowed = {"title", "type", "description", "is_secret_spot", "image_url", "place_type", "price_range"}
    update_data = {k: v for k, v in data.items() if k in allowed}
    update_data["updated_at"] = datetime.utcnow()

    collection = DatabaseManager.get_collection(COLLECTIONS["pins"])
    result = await collection.update_one({"_id": ObjectId(pin_id)}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Pin güncellenemedi")
    return await PinService.find_one(pin_id)


@router.delete("/{pin_id}", summary="Konum pinini sil (sadece oluşturan kullanıcı)")
async def delete_map_pin(
    pin_id:       str  = Path(..., description="Silinecek pin'in ObjectId'si"),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(pin_id):
        raise HTTPException(status_code=400, detail="Geçersiz pin ID")
    pin = await PinService.find_one(pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin bulunamadı")
    if pin.get("user_id") and pin["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Sadece oluşturan kullanıcı silebilir")
    deleted = await DatabaseManager.delete_one(COLLECTIONS["pins"], pin_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Pin silinemedi")
    return {"success": True, "message": "Pin silindi", "pin_id": pin_id}


@router.post("/{pin_id}/rate", summary="Pin için yıldız puanı ver (1-5)")
async def rate_map_pin(
    pin_id:       str  = Path(...),
    data:         dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(pin_id):
        raise HTTPException(status_code=400, detail="Geçersiz pin ID")
    pin = await PinService.find_one(pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin bulunamadı")

    user_id    = current_user["user_id"]  # JWT'den al, body'deki yoksayılır
    new_rating = float(data.get("rating", 0))
    if not (1 <= new_rating <= 5):
        raise HTTPException(status_code=400, detail="Puan 1-5 arasında olmalı")

    collection = DatabaseManager.get_collection(COLLECTIONS["pins"])
    ratings    = pin.get("ratings", {})
    ratings[user_id] = new_rating
    avg = round(sum(ratings.values()) / len(ratings), 1)

    await collection.update_one(
        {"_id": ObjectId(pin_id)},
        {"$set": {"ratings": ratings, "rating": avg, "updated_at": datetime.utcnow()}},
    )
    return {"success": True, "rating": avg, "total_ratings": len(ratings)}
