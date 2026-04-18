"""
Auth Router
===========
POST /api/auth/register — Create account, return JWT
POST /api/auth/login    — Authenticate, return JWT
GET  /api/auth/me       — Return current user from token

Note: prefix "/api/auth" is applied in api.py — NOT here.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from services.auth_service import (
    register_user,
    authenticate_user,
    verify_token,
    get_user_by_id,
)

router = APIRouter()
security = HTTPBearer(auto_error=False)


# ── Request Models ────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


# ── Auth Dependency (reusable across routers) ─────────────────────────────────
def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    FastAPI dependency: extract and verify JWT from Authorization header.
    Returns user dict or raises 401.
    """
    authorization = request.headers.get("Authorization")
    print("RAW AUTH HEADER:", authorization)

    if not authorization or credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Support "Bearer <token>" format
    token = authorization
    if token.startswith("Bearer "):
        token = token[7:]
    if credentials.credentials:
        token = credentials.credentials
    print("TOKEN AFTER STRIP:", token)

    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    print("DECODED PAYLOAD:", payload)

    user = get_user_by_id(payload["user_id"])
    if not user:
        # Fallback for SaaS users: allow access if token is valid, 
        # even if not in local SQLite.
        return {
            "id": payload["user_id"],
            "username": payload.get("username"),
            "plan": payload.get("plan", "free")
        }

    return user


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.post("/register")
def auth_register(body: RegisterRequest):
    """Register a new user account."""
    result = register_user(body.username, body.password)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["reason"])
    return result


@router.post("/login")
def auth_login(body: LoginRequest):
    """Authenticate and return JWT token."""
    result = authenticate_user(body.username, body.password)
    if not result["success"]:
        raise HTTPException(status_code=401, detail=result["reason"])
    return result


@router.get("/me")
def auth_me(user: dict = Depends(get_current_user)):
    """Return current authenticated user."""
    return {"user": user}
