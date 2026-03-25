"""
PLANİGO - Standard Response Helpers
Provides consistent {success, data, message} response shapes.
"""

from fastapi import HTTPException
from typing import Any


def ok(data: Any = None, message: str = "OK") -> dict:
    """Returns a successful response envelope."""
    return {"success": True, "data": data, "message": message}


def fail(message: str, status: int = 400):
    """Raises an HTTPException with the given message and status code."""
    raise HTTPException(status_code=status, detail=message)
