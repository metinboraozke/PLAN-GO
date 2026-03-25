"""
PLANİGO - Story Router
Instagram-tarzı hikayeler: ülke bazlı story grupları.
"""
import logging
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

from database import StoryService
from models import StoryCreate
from auth import get_optional_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Stories"])


@router.get("/api/v1/stories", response_model=None, summary="Kullanıcının hikayelerini ülkeye göre grupla")
async def get_stories(current_user: dict = Depends(get_optional_user)):
    if not current_user:
        return JSONResponse(content=[])

    user_id = current_user["user_id"]
    stories = await StoryService.find_by_user(user_id)

    cutoff = datetime.utcnow() - timedelta(hours=24)

    # Ülke koduna göre grupla
    groups: dict = {}
    for s in stories:
        code = s.get("country_code", "XX")
        if code not in groups:
            groups[code] = {
                "country_code": code,
                "country_name": s.get("country_name", code),
                "stories":      [],
                "has_recent":   False,
            }
        # created_at string veya datetime olabilir
        created_raw = s.get("created_at")
        if isinstance(created_raw, str):
            try:
                created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00").replace("+00:00", ""))
            except Exception:
                created_dt = datetime.utcnow()
        elif isinstance(created_raw, datetime):
            created_dt = created_raw
        else:
            created_dt = datetime.utcnow()

        if created_dt > cutoff:
            groups[code]["has_recent"] = True

        groups[code]["stories"].append({
            "_id":          s.get("_id", ""),
            "media_url":    s.get("media_url", ""),
            "caption":      s.get("caption"),
            "created_at":   created_dt.isoformat(),
            "country_code": code,
            "country_name": s.get("country_name", code),
        })

    return JSONResponse(content=jsonable_encoder(list(groups.values())))


@router.post("/api/v1/stories", response_model=None, status_code=201, summary="Yeni hikaye ekle")
async def add_story(
    story: StoryCreate,
    current_user: dict = Depends(get_optional_user),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Giriş yapman gerekiyor.")

    user_id = current_user["user_id"]

    # Basit boyut kontrolü — base64 ~1.33x overhead → 3MB limit
    if len(story.media_url) > 4_000_000:
        raise HTTPException(status_code=413, detail="Dosya çok büyük (max ~3MB).")

    doc = {
        "user_id":      user_id,
        "country_code": story.country_code.upper(),
        "country_name": story.country_name,
        "media_url":    story.media_url,
        "caption":      story.caption,
        "created_at":   datetime.utcnow(),
    }

    story_id = await StoryService.create(doc)
    if not story_id:
        raise HTTPException(status_code=500, detail="Story kaydedilemedi.")

    logger.info(f"[Story] Yeni story: user={user_id} ülke={story.country_code}")
    return JSONResponse(content={"id": story_id, "status": "ok"}, status_code=201)


@router.delete("/api/v1/stories/{story_id}", status_code=204, summary="Hikaye sil")
async def delete_story(
    story_id: str = Path(...),
    current_user: dict = Depends(get_optional_user),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Giriş yapman gerekiyor.")

    deleted = await StoryService.delete(story_id, current_user["user_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Story bulunamadı veya silme yetkisi yok.")
