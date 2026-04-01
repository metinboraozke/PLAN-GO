"""
PLANİGO - Shared FastAPI Dependencies
Centralizes ObjectId validation and re-exports auth dependencies.
"""

from bson import ObjectId
from fastapi import HTTPException

# Re-export auth dependencies so routers only import from core.deps
from auth import get_current_user, get_optional_user  # noqa: F401


def validate_object_id(id: str) -> ObjectId:
    """
    Validates and converts a string to BSON ObjectId.
    Raises HTTP 400 if the string is not a valid ObjectId.
    """
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Geçersiz ID formatı")
    return ObjectId(id)
