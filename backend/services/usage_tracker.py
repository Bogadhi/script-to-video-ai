"""
API Usage Tracker
=================
Tracks daily API usage globally across the platform:
- total_gemini_calls_per_day
- total_video_generations_per_day
- total_failures

Provides soft limit warnings and hard stops when thresholds are exceeded.
Resets daily at midnight.
"""

import os
import json
import threading
import logging
from datetime import date, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
DAILY_GEMINI_SOFT_LIMIT  = int(os.environ.get("DAILY_GEMINI_SOFT_LIMIT", "800"))
DAILY_GEMINI_HARD_LIMIT  = int(os.environ.get("DAILY_GEMINI_HARD_LIMIT", "1000"))
DAILY_VIDEO_SOFT_LIMIT   = int(os.environ.get("DAILY_VIDEO_SOFT_LIMIT", "400"))
DAILY_VIDEO_HARD_LIMIT   = int(os.environ.get("DAILY_VIDEO_HARD_LIMIT", "500"))

_STATE_FILE = Path(__file__).parent.parent / "usage_state.json"
_lock = threading.Lock()


# ── In-memory state ──────────────────────────────────────────────────────────
_state: dict = {
    "date": str(date.today()),
    "gemini_calls": 0,
    "video_generations": 0,
    "failures": 0,
    "sum_quality_score": 0,
    "low_quality_count": 0,
    "retry_success_count": 0,
    "total_retries": 0,
    "fallback_count": 0,
    "sum_duration_sec": 0.0,
    
    # Phase 13 Feedback Tracking
    "total_views": 0,
    "total_likes": 0,
    "feedback_entries": 0,
}


def _load_state() -> None:
    """Load persisted state from disk."""
    global _state
    try:
        if _STATE_FILE.exists():
            data = json.loads(_STATE_FILE.read_text())
            if data.get("date") == str(date.today()):
                _state.update(data)
                return
    except Exception as e:
        logger.warning("[usage_tracker] Failed to load state: %s", e)
    # New day or corruption: reset
    _reset_state()


def _reset_state() -> None:
    global _state
    _state = {
        "date": str(date.today()),
        "gemini_calls": 0,
        "video_generations": 0,
        "failures": 0,
        "sum_quality_score": 0,
        "low_quality_count": 0,
        "retry_success_count": 0,
        "total_retries": 0,
        "fallback_count": 0,
        "sum_duration_sec": 0.0,
        "total_views": 0,
        "total_likes": 0,
        "feedback_entries": 0,
    }
    _persist_state()


def _persist_state() -> None:
    try:
        _STATE_FILE.write_text(json.dumps(_state, indent=2))
    except Exception as e:
        logger.debug("[usage_tracker] Persist failed: %s", e)


def _check_date_reset() -> None:
    """Auto-reset if it's a new day."""
    if _state.get("date") != str(date.today()):
        _reset_state()


# Initialize on import
_load_state()


# ── Public API ────────────────────────────────────────────────────────────────
def record_gemini_call() -> None:
    """Increment Gemini call counter."""
    with _lock:
        _check_date_reset()
        _state["gemini_calls"] += 1
        _persist_state()
    logger.debug("[usage_tracker] Gemini calls today: %d", _state["gemini_calls"])


def record_video_generation(success: bool = True) -> None:
    """Increment video generation counter."""
    with _lock:
        _check_date_reset()
        _state["video_generations"] += 1
        if not success:
            _state["failures"] += 1
        _persist_state()


def record_failure() -> None:
    """Increment failure counter."""
    with _lock:
        _check_date_reset()
        _state["failures"] += 1
        _persist_state()

def record_feedback(views: int, likes: int, retries: int = 0) -> None:
    """Record retention/feedback metrics to allow future hook optimization."""
    with _lock:
        _check_date_reset()
        _state["total_views"] = _state.get("total_views", 0) + views
        _state["total_likes"] = _state.get("total_likes", 0) + likes
        _state["total_retries"] = _state.get("total_retries", 0) + retries
        _state["feedback_entries"] = _state.get("feedback_entries", 0) + 1
        _persist_state()


def check_gemini_budget() -> dict:
    """
    Check if Gemini budget allows more calls.

    Returns:
        { allowed: bool, warning: bool, message: str }
    """
    with _lock:
        _check_date_reset()
        count = _state["gemini_calls"]

    if count >= DAILY_GEMINI_HARD_LIMIT:
        logger.error("[usage_tracker] HARD LIMIT REACHED: %d Gemini calls", count)
        return {
            "allowed": False,
            "warning": False,
            "message": f"Daily AI budget exhausted ({count}/{DAILY_GEMINI_HARD_LIMIT}). Resets at midnight.",
        }
    if count >= DAILY_GEMINI_SOFT_LIMIT:
        return {
            "allowed": True,
            "warning": True,
            "message": f"Approaching daily AI limit ({count}/{DAILY_GEMINI_HARD_LIMIT}). Conserving usage.",
        }
    return {"allowed": True, "warning": False, "message": ""}


def check_video_budget() -> dict:
    """Check if video generation budget allows more runs."""
    with _lock:
        _check_date_reset()
        count = _state["video_generations"]

    if count >= DAILY_VIDEO_HARD_LIMIT:
        logger.error("[usage_tracker] HARD LIMIT REACHED: %d video generations", count)
        return {
            "allowed": False,
            "warning": False,
            "message": f"Daily video limit reached ({count}/{DAILY_VIDEO_HARD_LIMIT}). Resets at midnight.",
        }
    if count >= DAILY_VIDEO_SOFT_LIMIT:
        return {
            "allowed": True,
            "warning": True,
            "message": f"High demand today ({count}/{DAILY_VIDEO_HARD_LIMIT}). Processing may be slower.",
        }
    return {"allowed": True, "warning": False, "message": ""}


def get_daily_stats() -> dict:
    """Return current day's usage stats."""
    with _lock:
        _check_date_reset()
        return {
            "date": _state["date"],
            "gemini_calls": _state["gemini_calls"],
            "gemini_limit": DAILY_GEMINI_HARD_LIMIT,
            "video_generations": _state["video_generations"],
            "video_limit": DAILY_VIDEO_HARD_LIMIT,
            "failures": _state["failures"],
            "gemini_budget_ok": _state["gemini_calls"] < DAILY_GEMINI_HARD_LIMIT,
            "video_budget_ok": _state["video_generations"] < DAILY_VIDEO_HARD_LIMIT,
        }

def record_pipeline_metrics(score: int, was_fallback: bool, retries_used: int, duration_sec: float, success: bool = True) -> None:
    """Record pipeline quality and resilience metrics."""
    with _lock:
        _check_date_reset()
        _state["sum_quality_score"] = _state.get("sum_quality_score", 0) + score
        _state["sum_duration_sec"] = _state.get("sum_duration_sec", 0.0) + duration_sec
        
        if score < 60:
            _state["low_quality_count"] = _state.get("low_quality_count", 0) + 1
            
        if was_fallback:
            _state["fallback_count"] = _state.get("fallback_count", 0) + 1
            
        if retries_used > 0:
            _state["total_retries"] = _state.get("total_retries", 0) + 1
            if success and not was_fallback:
                _state["retry_success_count"] = _state.get("retry_success_count", 0) + 1
                
        _persist_state()

def get_metrics_summary() -> dict:
    """Fetch global pipeline quality report."""
    with _lock:
        _check_date_reset()
        runs = max(_state.get("video_generations", 1), 1)
        retries = max(_state.get("total_retries", 1), 1)
        
        return {
            "date": _state.get("date"),
            "total_runs": _state.get("video_generations", 0),
            "avg_quality_score": round(_state.get("sum_quality_score", 0) / runs, 1),
            "low_quality_rate": round(_state.get("low_quality_count", 0) / runs, 2),
            "retry_success_rate": round(_state.get("retry_success_count", 0) / retries, 2),
            "fallback_rate": round(_state.get("fallback_count", 0) / runs, 2),
            "avg_duration_sec": round(_state.get("sum_duration_sec", 0.0) / runs, 1)
        }
