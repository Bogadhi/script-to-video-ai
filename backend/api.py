"""
ScriptToVideo AI Pipeline — FastAPI entry point.

Run:
    uvicorn api:app --port 5001 --reload

This is the SINGLE authoritative entry point.
main.py is a thin shim that delegates here.
"""

import os
import re
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

from routers import scripts, pipeline, credits, auth

# ── Production Services (graceful degradation if not imported yet) ───────────
try:
    from services.rate_limiter import check_request_allowed, get_usage_snapshot
    from services.usage_tracker import get_daily_stats
    from services.cache_system import get_cache_stats
    _hardening_ok = True
except ImportError:
    _hardening_ok = False
    check_request_allowed = lambda ip: {"allowed": True}
    get_usage_snapshot = lambda: {}
    get_daily_stats = lambda: {}
    get_cache_stats = lambda: {}

# ── BASE DIR ─────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECTS_DIR = os.path.join(BASE_DIR, "projects")

os.makedirs(PROJECTS_DIR, exist_ok=True)

# ── APP ──────────────────────────────────────────────
app = FastAPI(
    title="ScriptToVideo AI Pipeline",
    version="2.1.0",
    description="Convert scripts to cinematic YouTube-ready videos automatically.",
)

# ── CORS ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── STATIC — serve /projects/<id>/... directly to browser ─
app.mount(
    "/projects",
    StaticFiles(directory=PROJECTS_DIR),
    name="projects",
)

# ── ROUTERS ──────────────────────────────────────────
# Note: routers must NOT include /api/scripts or /api/pipeline in their
# own prefix — the prefix is applied here and only here.
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(scripts.router, prefix="/api/scripts", tags=["scripts"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(credits.router, prefix="/api/credits", tags=["credits"])

# ── Paths to SKIP rate limiting ─────────────────────────────────────────────
# Status polling, health, auth endpoints, and static files
_RATE_LIMIT_SKIP_PATTERNS = [
    re.compile(r"^/api/pipeline/.+/status$"),   # status polling
    re.compile(r"^/api/auth/"),                  # auth endpoints
    re.compile(r"^/health$"),
    re.compile(r"^/favicon\.ico$"),
    re.compile(r"^/projects/"),                  # static files
]

# ── RATE LIMITING MIDDLEWARE ───────────────────────────────────────────────────────
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path

    # Skip rate limiting for whitelisted paths
    for pattern in _RATE_LIMIT_SKIP_PATTERNS:
        if pattern.match(path):
            return await call_next(request)

    # Extract IP
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.headers.get("X-Real-IP") or
        (request.client.host if request.client else "127.0.0.1")
    )

    result = check_request_allowed(ip)
    if not result["allowed"]:
        return JSONResponse(
            status_code=429,
            content={
                "error": result["error"],
                "retry_after": result.get("retry_after", 5),
            },
            headers={"Retry-After": str(int(result.get("retry_after", 5)))},
        )
    return await call_next(request)

# ── HEALTH & ADMIN ──────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "ScriptToVideo AI Pipeline", "version": "2.1.0"}


@app.get("/admin/stats", tags=["admin"])
def admin_stats():
    """Real-time system health and usage metrics."""
    return {
        "status": "ok",
        "rate_limiter": get_usage_snapshot(),
        "daily_usage": get_daily_stats(),
        "cache": get_cache_stats(),
    }