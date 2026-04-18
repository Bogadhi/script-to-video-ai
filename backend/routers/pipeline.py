"""
Pipeline status and metadata endpoints.

GET /api/pipeline/{project_id}/status
    → { overall_status, steps, artifacts, error }

GET /api/pipeline/{project_id}/metadata
    → YouTube metadata dict from metadata/youtube.json

Note: prefix "/api/pipeline" is applied in api.py — NOT here.
"""

import os
import json

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from utils.status import read_status, increment_retry, set_overall
from workers.pipeline_worker import run_pipeline_async
from routers.auth import get_current_user

router = APIRouter()

class FeedbackSchema(BaseModel):
    rating: str
    issueType: Optional[str] = None


# ── base directory ────────────────────────────────────────────────────────────
BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "projects")


def _url_if_exists(project_id: str, relative_path: str) -> str | None:
    """
    Return a browser-usable URL /projects/<id>/... if the file exists,
    or None if it doesn't exist yet.
    Never returns OS absolute paths or Windows backslashes.
    """
    abs_path = os.path.join(BASE_DIR, project_id, relative_path)
    if os.path.isfile(abs_path) and os.path.getsize(abs_path) > 0:
        # Forward slashes always — works on Windows browser fetch too
        safe = relative_path.replace(os.sep, "/")
        return f"/projects/{project_id}/{safe}"
    return None


def _video_url(project_id: str) -> str | None:
    return _url_if_exists(project_id, "final_subs.mp4") or _url_if_exists(project_id, "final.mp4")


# ── GET /api/pipeline/{project_id}/status ─────────────────────────────────────
@router.get("/{project_id}/status")
def get_pipeline_status(project_id: str, user: dict = Depends(get_current_user)):
    """Return current pipeline status and any available artifacts."""
    project_dir = os.path.join(BASE_DIR, project_id)
    if not os.path.isdir(project_dir):
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    # Mapping helper for consistent UI response
    status_map = {"running": "processing", "complete": "completed"}

    # ── Try reading from atomic state.json first ──────────────────────────────
    state_path = os.path.join(project_dir, "state.json")
    if os.path.isfile(state_path):
        try:
            with open(state_path, "r", encoding="utf-8") as f:
                state_data = json.load(f)
            
            # Map historical strings for safety
            os_val = state_data.get("overall_status", "pending")
            state_data["overall_status"] = status_map.get(os_val, os_val)
            
            if "steps" in state_data:
                for s in state_data["steps"]:
                    s_val = s.get("status", "pending")
                    s["status"] = status_map.get(s_val, s_val)

            # Synthesis for missing steps (old projects)
            if "steps" not in state_data or not state_data["steps"]:
                from utils.status import PIPELINE_STEPS
                state_data["steps"] = [
                    {"name": s, "status": "completed" if state_data["overall_status"] == "completed" else "pending"}
                    for s in PIPELINE_STEPS
                ]

            # Merge with artifacts
            state_data["artifacts"] = {
                "final_video": _video_url(project_id),
                "video":       _video_url(project_id),
                "thumbnail":   _url_if_exists(project_id, "thumbnail.jpg"),
                "subtitles":   _url_if_exists(project_id, "subtitles.srt"),
                "metadata":    _url_if_exists(project_id, "metadata/youtube.json"),
            }
            
            # UI stability: round progress
            raw_prog = state_data.get("progress", 0)
            if raw_prog > 100.0: raw_prog = raw_prog / 100.0
            state_data["progress"] = round(min(max(raw_prog, 0.0), 1.0), 2)

            return state_data
        except Exception:
            pass # Fallback only if read fails

    # Fallback to status.json
    status = read_status(project_id)
    os_val = status.get("overall_status", "pending")
    overall = status_map.get(os_val, os_val)
    
    steps = status.get("steps", [])
    for s in steps:
        s_val = s.get("status", "pending")
        s["status"] = status_map.get(s_val, s_val)

    return {
        "overall_status": overall,
        "steps":          steps,
        "artifacts": {
            "final_video": _video_url(project_id),
            "video":       _video_url(project_id),
            "thumbnail":   _url_if_exists(project_id, "thumbnail.jpg"),
            "subtitles":   _url_if_exists(project_id, "subtitles.srt"),
            "metadata":    _url_if_exists(project_id, "metadata/youtube.json"),
        },
        "error":          status.get("error"),
        "progress":       round(min(max(status.get("progress", 0), 0), 1), 2),
        "current_step":   status.get("current_step", "pending"),
    }


# ── GET /api/pipeline/{project_id}/metadata ───────────────────────────────────
@router.get("/{project_id}/metadata")
def get_pipeline_metadata(project_id: str, user: dict = Depends(get_current_user)):
    """Return the generated YouTube metadata JSON for a project."""

    project_dir = os.path.join(BASE_DIR, project_id)
    if not os.path.isdir(project_dir):
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    meta_path = os.path.join(project_dir, "metadata", "youtube.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(
            status_code=404,
            detail="Metadata not ready yet. Wait for the pipeline to complete.",
        )

    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)


# ── GET /api/pipeline/{project_id}/result ─────────────────────────────────────
@router.get("/{project_id}/result")
def get_pipeline_result(project_id: str, user: dict = Depends(get_current_user)):
    """
    Standardized final API output:
        { video_url, thumbnail_url, script, seo: { title, description, tags } }
    """
    project_dir = os.path.join(BASE_DIR, project_id)
    if not os.path.isdir(project_dir):
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    status_map = {"running": "processing", "complete": "completed"}
    overall = "pending"

    # 1. Try state.json first
    state_path = os.path.join(project_dir, "state.json")
    if os.path.isfile(state_path):
        try:
            with open(state_path, "r", encoding="utf-8") as f:
                state_data = json.load(f)
                raw_os = state_data.get("overall_status", "pending")
                overall = status_map.get(raw_os, raw_os)
        except Exception:
            pass

    # 2. Fallback to status.json
    if overall != "completed":
        status = read_status(project_id)
        raw_os = status.get("overall_status", "pending")
        overall = status_map.get(raw_os, raw_os)

    if overall != "completed":
        return {"status": overall, "detail": "Pipeline not yet complete"}

    script_text = ""
    script_path = os.path.join(project_dir, "script.txt")
    if os.path.isfile(script_path):
        with open(script_path, "r", encoding="utf-8") as f:
            script_text = f.read()

    seo = {}
    meta_path = os.path.join(project_dir, "metadata", "youtube.json")
    if os.path.isfile(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            full_meta = json.load(f)
        seo = {
            "title": full_meta.get("title", ""),
            "title_ab": full_meta.get("title_ab", ""),
            "description": full_meta.get("description", ""),
            "tags": full_meta.get("tags", []),
            "hashtags": full_meta.get("hashtags", []),
            "ctr_score": full_meta.get("ctr_score"),
            "seo_strength": full_meta.get("seo_strength"),
        }

    return {
        "video_url": _video_url(project_id),
        "thumbnail_url": _url_if_exists(project_id, "thumbnail.jpg"),
        "thumbnail_url_b": _url_if_exists(project_id, "thumbnail_b.jpg"),
        "subtitles_url": _url_if_exists(project_id, "subtitles.srt"),
        "script": script_text,
        "seo": seo,
    }


# ── POST /api/pipeline/{project_id}/retry ─────────────────────────────────────
@router.post("/{project_id}/retry")
def retry_pipeline(project_id: str, user: dict = Depends(get_current_user)):
    """
    Restart or Resume the pipeline for a project.
    Used by the 'Generate Final Video' button in the UI.
    """
    project_dir = os.path.join(BASE_DIR, project_id)
    if not os.path.isdir(project_dir):
        raise HTTPException(status_code=404, detail="Project not found")

    # Credit Protection / Retry Limit Check
    attempts = increment_retry(project_id)
    if attempts > 3:
        raise HTTPException(
            status_code=429,
            detail="⚠️ Max automated retries reached. Please create a new video."
        )

    # Set status to pending to give immediate UI feedback
    set_overall(project_id, "pending")

    # Pass resume=True to explicitly skip completed files without destroying data
    run_pipeline_async(project_id, resume=True)

    return {"success": True, "project_id": project_id, "attempt": attempts}


# ── POST /api/pipeline/{project_id}/feedback ──────────────────────────────────
@router.post("/{project_id}/feedback")
def submit_feedback(project_id: str, payload: FeedbackSchema, user: dict = Depends(get_current_user)):
    """Record user feedback/rating for a project."""
    project_dir = os.path.join(BASE_DIR, project_id)
    
    if not os.path.isdir(project_dir):
        raise HTTPException(status_code=404, detail="Project not found")
        
    try:
        from utils.status import _write_locked, _write_lock
        with _write_lock:
            data = read_status(project_id)
            data["user_feedback"] = {
                "rating": payload.rating,
                "issue_type": payload.issueType
            }
            _write_locked(project_id, data)
        return {"success": True, "status": "Feedback recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save feedback: {e}")
