"""
PLANİGO - Custom Exception Handlers
Registered on the FastAPI app in main.py.
"""

from fastapi import Request
from fastapi.responses import JSONResponse


async def not_found_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=404,
        content={"success": False, "message": "Kaynak bulunamadı", "data": None},
    )


async def validation_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=422,
        content={"success": False, "message": str(exc), "data": None},
    )


async def internal_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Sunucu hatası", "data": None},
    )
