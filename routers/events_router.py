"""
PLANİGO - Events Router
PAX etkinlik pin, katılım isteği ve grup sohbet endpoint'leri.
Extracted from main.py lines 207-565.
"""

from typing import List, Optional, Dict, Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from auth import get_current_user

from database import (
    DatabaseManager,
    EventPinService,
    JoinRequestService,
    NotificationService,
    COLLECTIONS,
)
from models import (
    EventPinCreate,
    EventPinInDB,
    EventPinResponse,
    EventType,
    EventStatus,
    JoinRequestCreate,
    JoinRequestInDB,
    JoinRequestResponse,
    JoinRequestStatus,
    JoinRequestStatusUpdate,
    ChatMessageCreate,
    ChatMessageInDB,
    ChatMessageResponse,
    NotificationCreate,
    NotificationType,
)

router = APIRouter(prefix="/api/v1/map/events", tags=["PAX Events"])


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _assert_event_access(event_id: str, user_id: str, requests_col) -> None:
    """Kullanıcının event'e erişim yetkisi yoksa 403 fırlatır."""
    events_col = DatabaseManager.get_collection(COLLECTIONS["event_pins"])
    event = await events_col.find_one({"_id": ObjectId(event_id)})
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadi")
    is_creator = event.get("creator_id") == user_id
    if not is_creator:
        req = await requests_col.find_one({"event_id": event_id, "user_id": user_id, "status": "approved"})
        if not req:
            raise HTTPException(status_code=403, detail="Sohbete erisim yetkiniz yok")


# ── Event Pin CRUD ─────────────────────────────────────────────────────────────

@router.post("", response_model=EventPinResponse, status_code=201, summary="Yeni PAX etkinlik pini oluştur")
async def create_event_pin(
    event:        EventPinCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        # creator_id / creator_name JWT'den override — body yoksayılır
        payload = event.model_dump()
        payload["creator_id"]   = current_user["user_id"]
        payload["creator_name"] = current_user.get("username") or payload.get("creator_name")
        db_obj   = EventPinInDB(**payload)
        doc      = db_obj.to_dict()
        event_id = await EventPinService.create(doc)
        if not event_id:
            raise HTTPException(status_code=500, detail="Etkinlik oluşturulamadı")
        created = await EventPinService.find_one(event_id)
        created["join_request_count"] = 0
        return EventPinResponse(**created)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veritabanı hatası: {str(e)}")


@router.get("", response_model=List[EventPinResponse], summary="Aktif etkinlik pinlerini listele")
async def list_event_pins(
    event_type: Optional[EventType] = None,
    city:       Optional[str]       = None,
    limit: int = Query(default=100, le=500),
    skip:  int = Query(default=0,   ge=0),
):
    try:
        query: Dict[str, Any] = {"status": EventStatus.ACTIVE.value}
        if event_type:
            query["event_type"] = event_type.value
        if city:
            query["city"] = city
        events = await EventPinService.find_all(query, skip, limit)
        event_ids = [str(ev["_id"]) for ev in events]
        counts = await EventPinService.batch_count_join_requests(event_ids)
        result = []
        for ev in events:
            ev["join_request_count"] = counts.get(str(ev["_id"]), 0)
            result.append(EventPinResponse(**ev))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Etkinlikler getirilemedi: {str(e)}")


@router.get("/{event_id}", response_model=EventPinResponse, summary="Tek bir etkinlik pinini getir")
async def get_event_pin(event_id: str = Path(...)):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")
    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    event["join_request_count"] = await EventPinService.count_join_requests(event_id)
    return EventPinResponse(**event)


@router.delete("/{event_id}", summary="Etkinlik pinini sil (sadece oluşturan kullanıcı)")
async def delete_event_pin(
    event_id: str = Path(...),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")
    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    if event.get("creator_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Sadece etkinliği oluşturan silebilir")
    deleted = await EventPinService.delete(event_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Etkinlik silinemedi")
    return {"success": True, "message": "Etkinlik silindi", "event_id": event_id}


# ── Join Requests ─────────────────────────────────────────────────────────────

@router.post("/{event_id}/join", response_model=JoinRequestResponse, status_code=201, summary="Etkinliğe katılma isteği gönder")
async def send_join_request(
    event_id:     str               = Path(...),
    request:      JoinRequestCreate = ...,
    current_user: dict              = Depends(get_current_user),
):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")
    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    if event.get("status") != EventStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Bu etkinlik artık aktif değil")

    jwt_user_id = current_user["user_id"]
    if event.get("creator_id") == jwt_user_id:
        raise HTTPException(status_code=400, detail="Kendi etkinliğine istek gönderemezsin")
    if event.get("participant_count", 0) >= event.get("max_participants", 10):
        raise HTTPException(status_code=400, detail="Etkinlik dolu, yeni katılımcı alınmıyor")

    already = await JoinRequestService.already_requested(event_id, jwt_user_id)
    if already:
        raise HTTPException(status_code=409, detail="Bu etkinlik için zaten bir isteğin var")

    # user_id JWT'den alınıyor — body'deki user_id yoksayılır
    payload = request.model_dump()
    payload["user_id"] = jwt_user_id
    db_obj = JoinRequestInDB(**payload, event_id=event_id)
    req_id = await JoinRequestService.create(db_obj.to_dict())
    if not req_id:
        raise HTTPException(status_code=500, detail="İstek gönderilemedi")
    created = await JoinRequestService.find_one(req_id)
    return JoinRequestResponse(**created)


@router.get("/{event_id}/requests", response_model=List[JoinRequestResponse], summary="Etkinliğin katılma isteklerini listele")
async def list_join_requests(
    event_id:     str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")
    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    if event.get("creator_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Sadece etkinlik sahibi istekleri görebilir")
    requests = await JoinRequestService.find_by_event(event_id)
    return [JoinRequestResponse(**r) for r in requests]


@router.patch("/{event_id}/requests/{request_id}", response_model=JoinRequestResponse, summary="Katılma isteğini onayla veya reddet")
async def update_join_request_status(
    event_id:     str                     = Path(...),
    request_id:   str                     = Path(...),
    body:         JoinRequestStatusUpdate = ...,
    current_user: dict                    = Depends(get_current_user),
):
    if not ObjectId.is_valid(event_id) or not ObjectId.is_valid(request_id):
        raise HTTPException(status_code=400, detail="Geçersiz ID")
    event = await EventPinService.find_one(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    if event.get("creator_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Sadece etkinlik sahibi onaylayabilir/reddedebilir")
    req = await JoinRequestService.find_one(request_id)
    if not req or req.get("event_id") != event_id:
        raise HTTPException(status_code=404, detail="Katılma isteği bulunamadı")
    if req.get("status") != JoinRequestStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Bu istek zaten işleme alınmış")

    updated = await JoinRequestService.update_status(request_id, body.status.value)
    if not updated:
        raise HTTPException(status_code=500, detail="Durum güncellenemedi")

    if body.status == JoinRequestStatus.APPROVED:
        await EventPinService.increment_participant(event_id)
        notif = NotificationCreate(
            user_id=req["user_id"], type=NotificationType.JOIN_APPROVED,
            title="İsteğin onaylandı! 🎉",
            body=f"'{event.get('title', 'Etkinlik')}' etkinliğine katılım isteğin onaylandı.",
            event_id=event_id, event_title=event.get("title"), read=False,
        )
        await NotificationService.create(notif.model_dump())
    elif body.status == JoinRequestStatus.REJECTED:
        notif = NotificationCreate(
            user_id=req["user_id"], type=NotificationType.JOIN_REJECTED,
            title="İstek reddedildi",
            body=f"'{event.get('title', 'Etkinlik')}' etkinliğine katılım isteğin bu sefer kabul edilmedi.",
            event_id=event_id, event_title=event.get("title"), read=False,
        )
        await NotificationService.create(notif.model_dump())

    updated_req = await JoinRequestService.find_one(request_id)
    return JoinRequestResponse(**updated_req)


@router.delete("/{event_id}/join", summary="Katılma isteğini iptal et")
async def cancel_join_request(
    event_id:     str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")
    collection = DatabaseManager.get_collection(COLLECTIONS["join_requests"])
    result = await collection.delete_one({"event_id": event_id, "user_id": current_user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Katılma isteği bulunamadı")
    return {"success": True, "message": "Katılma isteği iptal edildi", "event_id": event_id}


# ── Event Group Chat ───────────────────────────────────────────────────────────

@router.post("/{event_id}/chat", response_model=ChatMessageResponse, status_code=201, summary="Etkinlik grup sohbetine mesaj gönder")
async def send_chat_message(
    event_id:     str              = Path(...),
    body:         ChatMessageCreate = ...,
    current_user: dict             = Depends(get_current_user),
):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")

    # user_id JWT'den alınıyor — body'deki user_id yoksayılır
    requests_col = DatabaseManager.get_collection(COLLECTIONS["join_requests"])
    await _assert_event_access(event_id, current_user["user_id"], requests_col)

    chat_col = DatabaseManager.get_collection(COLLECTIONS["event_chat"])
    payload  = body.model_dump()
    payload["user_id"] = current_user["user_id"]   # JWT'den override
    msg    = ChatMessageInDB(event_id=event_id, **payload)
    doc    = msg.to_dict()
    result = await chat_col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return ChatMessageResponse(**doc)


@router.get("/{event_id}/chat", response_model=List[ChatMessageResponse], summary="Etkinlik grup sohbeti mesajlarini getir")
async def get_chat_messages(
    event_id:     str  = Path(...),
    limit:        int  = Query(default=50, le=200),
    current_user: dict = Depends(get_current_user),
):
    # user_id artık JWT'den alınıyor — query param kaldırıldı
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Gecersiz etkinlik ID")

    requests_col = DatabaseManager.get_collection(COLLECTIONS["join_requests"])
    await _assert_event_access(event_id, current_user["user_id"], requests_col)

    chat_col = DatabaseManager.get_collection(COLLECTIONS["event_chat"])
    cursor   = chat_col.find({"event_id": event_id}).sort("created_at", 1).limit(limit)
    messages = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        messages.append(ChatMessageResponse(**doc))
    return messages


@router.get("/{event_id}/participants", summary="Onaylı katılımcıları profil fotoğraflarıyla getir")
async def get_event_participants(
    event_id:     str  = Path(...),
    current_user: dict = Depends(get_current_user),
):
    """Etkinliğe kabul edilmiş katılımcıları avatar_url ile birlikte döndürür."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=400, detail="Geçersiz etkinlik ID")

    requests_col = DatabaseManager.get_collection(COLLECTIONS["join_requests"])
    users_col    = DatabaseManager.get_collection(COLLECTIONS["users"])

    # Onaylı katılımcıları çek
    cursor = requests_col.find({"event_id": event_id, "status": "approved"})
    participants = []
    async for req in cursor:
        user_id   = req.get("user_id", "")
        user_name = req.get("user_name") or req.get("username") or "Katılımcı"
        avatar_url = None

        # Users koleksiyonundan avatar_url çek
        if user_id and ObjectId.is_valid(user_id):
            user_doc = await users_col.find_one(
                {"_id": ObjectId(user_id)},
                {"avatar_url": 1}
            )
            if user_doc:
                avatar_url = user_doc.get("avatar_url")

        participants.append({
            "user_id":   user_id,
            "user_name": user_name,
            "avatar_url": avatar_url,
        })

    return {"participants": participants}
