"""
Credits Router
==============
All endpoints require JWT authentication.

Endpoints:
- GET  /api/credits/status   → Current plan + usage
- POST /api/credits/redeem   → Redeem a coupon
- POST /api/credits/check    → Pre-check before generation

Note: prefix "/api/credits" is applied in api.py — NOT here.
"""

from fastapi import APIRouter, Depends, Body
from fastapi.responses import JSONResponse

from routers.auth import get_current_user
from services.credits_system import (
    check_can_generate,
    get_user_info,
    redeem_coupon,
)

router = APIRouter()


@router.get("/status")
def credits_status(user: dict = Depends(get_current_user)):
    """Return current plan and daily usage stats."""
    info = get_user_info(user["id"])
    return JSONResponse(content=info)


@router.post("/check")
def credits_check(
    user: dict = Depends(get_current_user),
    coupon: str = Body(default="", embed=True),
):
    """
    Pre-check if a user can generate a video.
    Returns { allowed, reason, daily_remaining, plan }.
    """
    result = check_can_generate(user["id"], coupon or None)
    status_code = 200 if result["allowed"] else 402
    return JSONResponse(content=result, status_code=status_code)


@router.post("/redeem")
def credits_redeem(
    user: dict = Depends(get_current_user),
    coupon: str = Body(..., embed=True),
):
    """Redeem a coupon code to activate a plan."""
    result = redeem_coupon(user["id"], coupon)
    status_code = 200 if result["success"] else 400
    return JSONResponse(content=result, status_code=status_code)
