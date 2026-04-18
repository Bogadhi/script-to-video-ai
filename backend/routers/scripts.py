"""
POST /api/scripts/create

Creates a new project, saves script + config, initialises status,
and kicks off the Celery pipeline task.

Requires JWT authentication. Credits are checked and tied to user_id.

Note: prefix "/api/scripts" is applied in api.py — NOT here.
"""

import os
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Form, Depends

from workers.pipeline_worker import run_pipeline_async
from utils.status import init_status
from routers.auth import get_current_user
from services.credits_system import check_can_generate

# ── router — NO prefix here (api.py provides it) ─────────────────────────────
router = APIRouter()

# Base directory
BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "projects")


@router.post("/create")
def create_script(
    user: dict = Depends(get_current_user),
    script_text: str = Form(...),
    video_category: str = Form("auto"),
    scene_count: int = Form(0),
    scene_duration: int = Form(0),
    voice_style: str = Form("calm"),
    music_style: str = Form("cinematic"),
    visual_style: str = Form("realistic"),
    thumbnail_style: str = Form("clean"),
):
    """Create a new video project and start the Celery pipeline."""

    user_id = user["id"]

    # ── Verify User Credits ──────────────────────────────────────────────────
    credit_status = check_can_generate(user_id)
    if not credit_status["allowed"]:
        raise HTTPException(
            status_code=402,
            detail=f"Credit limit reached. {credit_status.get('reason', '')}"
        )

    text = script_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Script cannot be empty.")

    # ── Create project directory ──────────────────────────────────────────────
    project_id = str(uuid.uuid4())
    project_dir = os.path.join(BASE_DIR, project_id)

    os.makedirs(project_dir, exist_ok=True)
    os.makedirs(os.path.join(project_dir, "scenes", "audio"), exist_ok=True)
    os.makedirs(os.path.join(project_dir, "scenes", "clips"), exist_ok=True)
    os.makedirs(os.path.join(project_dir, "scenes", "assembled"), exist_ok=True)
    os.makedirs(os.path.join(project_dir, "metadata"), exist_ok=True)

    # ── Save script ───────────────────────────────────────────────────────────
    with open(os.path.join(project_dir, "script.txt"), "w", encoding="utf-8") as f:
        f.write(text)

    # ── Save config ───────────────────────────────────────────────────────────
    config = {
        "project_id": project_id,
        "user_id": user_id,
        "category": video_category,
        "scene_count": scene_count,
        "scene_duration": scene_duration,
        "voice_style": voice_style,
        "music_style": music_style,
        "visual_style": visual_style,
        "thumbnail_style": thumbnail_style,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(os.path.join(project_dir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

    # ── Init pipeline status ──────────────────────────────────────────────────
    init_status(project_id)

    # ── Kick off Celery task ──────────────────────────────────────────────────
    run_pipeline_async(project_id)

    return {
        "success": True,
        "project_id": project_id,
    }