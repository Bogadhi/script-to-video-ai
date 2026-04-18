"""
Lightweight status tracking via status.json in each project folder.

Thread-safe: all writes are guarded by a threading.Lock to prevent
race conditions when the pipeline worker updates multiple steps rapidly.

status.json shape:
{
    "overall_status": "pending | processing | completed | error",
    "steps": [
        { "name": "scene_breakdown",  "status": "pending" },
        { "name": "voice_generation", "status": "pending" },
        { "name": "visual_selection", "status": "pending" },
        { "name": "scene_assembly",   "status": "pending" },
        { "name": "background_music", "status": "pending" },
        { "name": "final_assembly",   "status": "pending" },
        { "name": "subtitles",        "status": "pending" },
        { "name": "thumbnail",        "status": "pending" },
        { "name": "metadata",         "status": "pending" },
        { "name": "qa_check",         "status": "pending" }
    ],
    "error": null
}
"""

import os
import json
import time
import threading
from typing import Optional

# ── canonical step order ──────────────────────────────────────────────────────
PIPELINE_STEPS = [
    "scene_breakdown",
    "voice_generation",
    "visual_selection",
    "scene_assembly",
    "background_music",
    "final_assembly",
    "subtitles",
    "thumbnail",
    "metadata",
    "qa_check",
]

BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "projects")

# One lock per process — sufficient for Celery solo pool
_write_lock = threading.Lock()


def _status_path(project_id: str) -> str:
    return os.path.join(BASE_DIR, project_id, "status.json")


# ── public API ────────────────────────────────────────────────────────────────

def init_status(project_id: str) -> None:
    """Write an initial status.json for a brand-new project."""
    data = {
        "overall_status": "pending",
        "steps": [{"name": s, "status": "pending"} for s in PIPELINE_STEPS],
        "error": None,
        "last_successful_step": None,
        "failed_step": None,
        "retry_attempt": 0,
        "artifacts": {},
    }
    _write_locked(project_id, data)


def read_status(project_id: str) -> dict:
    """Return the current status dict (creates a default if missing)."""
    path = _status_path(project_id)
    if not os.path.isfile(path):
        init_status(project_id)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def set_overall(project_id: str, status: str, error: Optional[str] = None) -> None:
    """Update the top-level overall_status (and optionally record an error)."""
    # Map legacy/input statuses to standardized internal ones if needed
    status_map = {
        "running": "processing",
        "complete": "completed",
    }
    target_status = status_map.get(status, status)
    
    with _write_lock:
        data = read_status(project_id)
        data["overall_status"] = target_status
        if error is not None:
            data["error"] = error
        import time as _t
        data["updated_at"] = _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime())
        _write_locked(project_id, data)


def set_step(project_id: str, step_name: str, status: str, msg: Optional[str] = None) -> None:
    """Update a single step's status with an optional human-readable progress message."""
    # Map legacy/input statuses to standardized internal ones if needed
    status_map = {
        "running": "processing",
        "complete": "completed",
    }
    target_status = status_map.get(status, status)

    with _write_lock:
        data = read_status(project_id)
        for step in data["steps"]:
            if step["name"] == step_name:
                step["status"] = target_status
                if msg is not None:
                    step["msg"] = msg
                elif "msg" in step and target_status in ("completed", "error"):
                    step.pop("msg", None)
                break

        if target_status == "completed":
            data["last_successful_step"] = step_name
            data["failed_step"] = None
        elif target_status == "error":
            data["failed_step"] = step_name

        import time as _t
        data["updated_at"] = _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime())
        _write_locked(project_id, data)
        
def set_progress(project_id: str, progress: float) -> None:
    """Update top-level progress (0.0 to 1.0)."""
    with _write_lock:
        data = read_status(project_id)
        data["progress"] = progress
        _write_locked(project_id, data)

def increment_retry(project_id: str) -> int:
    """Increment and return the current retry_attempt count."""
    with _write_lock:
        data = read_status(project_id)
        current = data.get("retry_attempt", 0) + 1
        data["retry_attempt"] = current
        
        import time as _t
        data["updated_at"] = _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime())
        _write_locked(project_id, data)
        return current


# ── internal helpers ──────────────────────────────────────────────────────────

def _write(project_id: str, data: dict) -> None:
    """Write with lock acquisition (use when not already locked)."""
    with _write_lock:
        _write_locked(project_id, data)


def _write_locked(project_id: str, data: dict) -> None:
    """Write WITHOUT acquiring lock (caller must hold it)."""
    path = _status_path(project_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        
    for i in range(5):
        try:
            if os.path.exists(path):
                os.remove(path)
            os.rename(tmp_path, path)
            return
        except Exception as e:
            if i == 4: raise e
            time.sleep(0.1)
