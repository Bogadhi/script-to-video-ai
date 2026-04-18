"""
YouTube Upload Router
Handles YouTube upload and approval.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from models.db import get_db, Project

router = APIRouter(prefix="/api/youtube", tags=["youtube"])


@router.post("/{project_id}/upload")
def trigger_youtube_upload(
    project_id: str,
    privacy: str = Body("private", embed=True),
    db: Session = Depends(get_db),
):
    """Trigger YouTube upload for an approved project."""
    project = db.query(Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Pipeline must be completed before uploading."
        )
    if project.youtube_video_id:
        return {
            "message": "Already uploaded",
            "video_id": project.youtube_video_id,
            "url": project.youtube_url,
        }

    # TODO: Replace with standardized threading-based upload 
    # from workers.pipeline_worker import upload_to_youtube
    # task = upload_to_youtube.delay(project_id=project_id, privacy=privacy)

    return {
        "status": "disabled",
        "message": "YouTube upload via Celery is disabled. Use direct upload instead.",
        "project_id": project_id,
        "privacy": privacy,
    }


@router.get("/{project_id}/status")
def get_upload_status(project_id: str, db: Session = Depends(get_db)):
    """Get YouTube upload status for a project."""
    project = db.query(Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "project_id": project_id,
        "uploaded": project.youtube_video_id is not None,
        "video_id": project.youtube_video_id,
        "url": project.youtube_url,
        "privacy": project.youtube_privacy,
    }
