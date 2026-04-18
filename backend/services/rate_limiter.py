"""
Rate Limiter
============
Thread-safe, configurable rate limiting for:
- Global system requests (max per minute)
- Per-IP requests (max per minute)
- Gemini/LLM API calls (max per minute)

Celery-safe: uses threading.Lock (in-process memory per worker).
For multi-worker deployments, swap in Redis counters via REDIS_URL.
"""

import os
import time
import threading
import logging
from collections import defaultdict, deque
from typing import Optional

logger = logging.getLogger(__name__)

# ── Config from environment ──────────────────────────────────────────────────
GLOBAL_RPM_LIMIT = int(os.environ.get("GLOBAL_RPM_LIMIT", "300"))   # 300 req/min
IP_RPM_LIMIT     = int(os.environ.get("IP_RPM_LIMIT", "100"))       # 100 req/min/IP
GEMINI_RPM_LIMIT = int(os.environ.get("GEMINI_RPM_LIMIT", "30"))    # 30 Gemini calls/min

_WINDOW_SEC = 60.0

# ── Thread-safe sliding window counter ───────────────────────────────────────
class _SlidingWindowCounter:
    def __init__(self, limit: int, window: float = _WINDOW_SEC):
        self._limit = limit
        self._window = window
        self._lock = threading.Lock()
        self._timestamps: deque = deque()

    def is_allowed(self) -> bool:
        """Check if a new request is allowed and record it."""
        now = time.monotonic()
        with self._lock:
            cutoff = now - self._window
            # Prune old entries
            while self._timestamps and self._timestamps[0] < cutoff:
                self._timestamps.popleft()
            if len(self._timestamps) >= self._limit:
                return False
            self._timestamps.append(now)
            return True

    def current_count(self) -> int:
        now = time.monotonic()
        with self._lock:
            cutoff = now - self._window
            while self._timestamps and self._timestamps[0] < cutoff:
                self._timestamps.popleft()
            return len(self._timestamps)

    def seconds_until_free(self) -> float:
        now = time.monotonic()
        with self._lock:
            if len(self._timestamps) < self._limit:
                return 0.0
            oldest = self._timestamps[0]
            return max(0.0, (oldest + self._window) - now)


# ── Global counters ──────────────────────────────────────────────────────────
_global_counter = _SlidingWindowCounter(GLOBAL_RPM_LIMIT)
_gemini_counter = _SlidingWindowCounter(GEMINI_RPM_LIMIT)

# Per-IP counters (auto-created)
_ip_lock = threading.Lock()
_ip_counters: dict[str, _SlidingWindowCounter] = {}


def _get_ip_counter(ip: str) -> _SlidingWindowCounter:
    with _ip_lock:
        if ip not in _ip_counters:
            _ip_counters[ip] = _SlidingWindowCounter(IP_RPM_LIMIT)
        return _ip_counters[ip]


# ── Public API ────────────────────────────────────────────────────────────────
def check_request_allowed(ip: str) -> dict:
    """
    Check if a new incoming request is allowed.

    Returns:
        { allowed: bool, error: str | None, retry_after: float }
    """
    # ── Dev Exemption: Localhost is NEVER rate limited ─────────────────────
    if ip in ("127.0.0.1", "localhost", "::1"):
        return {"allowed": True, "error": None, "retry_after": 0}

    # Global system limit
    if not _global_counter.is_allowed():
        wait = _global_counter.seconds_until_free()
        logger.warning("[rate_limiter] Global limit hit from %s", ip)
        return {
            "allowed": False,
            "error": "Server busy. Please try again in a few seconds.",
            "retry_after": round(wait, 1),
        }

    # Per-IP limit
    ip_counter = _get_ip_counter(ip)
    if not ip_counter.is_allowed():
        wait = ip_counter.seconds_until_free()
        logger.warning("[rate_limiter] IP limit hit: %s", ip)
        return {
            "allowed": False,
            "error": f"Too many requests from your IP. Please wait {round(wait)}s.",
            "retry_after": round(wait, 1),
        }

    return {"allowed": True, "error": None, "retry_after": 0}


def check_gemini_allowed() -> dict:
    """
    Check if a Gemini/LLM API call is allowed within the rate window.
    Call this BEFORE making an LLM request.

    Returns:
        { allowed: bool, error: str | None }
    """
    if not _gemini_counter.is_allowed():
        wait = _gemini_counter.seconds_until_free()
        logger.warning("[rate_limiter] Gemini limit hit (%d/min)", GEMINI_RPM_LIMIT)
        return {
            "allowed": False,
            "error": "AI service busy. Please retry in a few seconds.",
            "retry_after": round(wait, 1),
        }
    return {"allowed": True, "error": None, "retry_after": 0}


def get_usage_snapshot() -> dict:
    """Return current rate limiter usage stats."""
    return {
        "global_rpm_used": _global_counter.current_count(),
        "global_rpm_limit": GLOBAL_RPM_LIMIT,
        "gemini_rpm_used": _gemini_counter.current_count(),
        "gemini_rpm_limit": GEMINI_RPM_LIMIT,
        "active_ips": len(_ip_counters),
    }
