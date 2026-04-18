from fastapi import APIRouter, UploadFile, Form
from celery.result import AsyncResult
from celery.result import AsyncResult
from workers.pipeline_worker import celery_app
import uuid
import os
import json

from workers.pipeline_worker import run_full_pipeline
from utils.status import increment_retry

router = APIRouter()

PROJECTS_DIR = "projects"

# -------------------------
# HEALTH CHECK
# -------------------------
@router.get("/api/health")
def api_health():
    try:
        # Check celery ping
        res = celery_app.control.ping(timeout=1.0)
        celery_status = "ok" if res else "down"
    except Exception:
        celery_status = "down"
        
    return {
        "api": "ok",
        "celery": celery_status
    }

# -------------------------
# CREATE SCRIPT
# -------------------------
@router.post("/api/scripts/create")
async def create_script(
    script_text: str = Form(...),
    video_category: str = Form("auto"),
    scene_count: str = Form("0"),
    scene_duration: str = Form("0"),
    voice_style: str = Form(""),
    music_style: str = Form(""),
    visual_style: str = Form(""),
    thumbnail_style: str = Form("")
):
    project_id = str(uuid.uuid4())
    project_path = os.path.join(PROJECTS_DIR, project_id)

    os.makedirs(project_path, exist_ok=True)

    # Save script
    with open(os.path.join(project_path, "script.txt"), "w", encoding="utf-8") as f:
        f.write(script_text)

    # Save config
    config = {
        "script": script_text,
        "category": video_category,
        "scene_count": int(scene_count),
        "scene_duration": int(scene_duration),
        "voice_style": voice_style,
        "music_style": music_style,
        "visual_style": visual_style,
        "thumbnail_style": thumbnail_style,
    }

    with open(os.path.join(project_path, "config.json"), "w") as f:
        json.dump(config, f, indent=2)

    return {"project_id": project_id}


# -------------------------
# START PIPELINE
# -------------------------
@router.post("/api/pipeline/{project_id}/start")
def start_pipeline(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, project_id)

    config_path = os.path.join(project_path, "config.json")

    if not os.path.exists(config_path):
        return {"error": "Project not found"}

    with open(config_path) as f:
        config = json.load(f)

    task = run_full_pipeline.delay(project_id)

    return {"task_id": str(task.id)}


# -------------------------
# RETRY PIPELINE
# -------------------------
@router.post("/api/pipeline/{project_id}/retry")
def retry_pipeline(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, project_id)
    config_path = os.path.join(project_path, "config.json")

    if not os.path.exists(config_path):
        return {"error": "Project not found"}

    # Credit Protection / Retry Limit Check
    attempts = increment_retry(project_id)
    if attempts > 3:  # (max 2 retries means attempts will be 1, 2, 3) 
        # Wait, if initial is 0, retry 1 sets it to 1, retry 2 sets it to 2.
        # If it's already 2, incrementing it makes it 3, so we block it.
        return {"error": "⚠️ We couldn't fix this automatically. Please regenerate your video."}

    # Pass resume=True to explicitly skip completed files without destroying data
    task = run_full_pipeline.delay(project_id, resume=True)

    return {"task_id": str(task.id)}

# -------------------------
# PIPELINE STATUS
# -------------------------
@router.get("/api/pipeline/{project_id}/status")
def pipeline_status(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, project_id)

    final_video = os.path.join(project_path, "final.mp4")

    if os.path.exists(final_video):
        return {
            "overall_status": "completed",
            "steps": [],
        }

    return {
        "overall_status": "processing",
        "steps": []
    }

# -------------------------
# ADMIN METRICS
# -------------------------
@router.get("/api/admin/metrics")
def admin_metrics():
    from services.usage_tracker import get_metrics_summary
    return get_metrics_summary()

# -------------------------
# FEEDBACK SYSTEM
# -------------------------
from pydantic import BaseModel

class FeedbackSchema(BaseModel):
    rating: str
    issueType: str = None

@router.post("/api/pipeline/{project_id}/feedback")
def submit_feedback(project_id: str, payload: FeedbackSchema):
    project_path = os.path.join(PROJECTS_DIR, project_id)
    status_file = os.path.join(project_path, "status.json")
    
    if not os.path.exists(status_file):
        return {"error": "Project not found"}
        
    with open(status_file, "r") as f:
        st = json.load(f)
        
    st["user_feedback"] = {
        "rating": payload.rating,
        "issue_type": payload.issueType
    }
    
    with open(status_file, "w") as f:
        json.dump(st, f, indent=2)
        
    return {"status": "Feedback recorded successfully"}