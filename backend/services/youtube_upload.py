"""
YouTube Upload Service
Uses Google YouTube Data API v3 with OAuth2 refresh tokens.
"""

import os
import json
from typing import Dict, Any, Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

YOUTUBE_CATEGORY_IDS = {
    "Education": "27",
    "Travel & Events": "19",
    "Science & Technology": "28",
    "Entertainment": "24",
    "People & Blogs": "22",
    "News & Politics": "25",
    "Howto & Style": "26",
}

PRIVACY_OPTIONS = {"public", "private", "unlisted"}


def _build_youtube_client():
    """Build authenticated YouTube API client using OAuth2 refresh token."""
    creds = Credentials(
        token=None,
        refresh_token=os.getenv("GOOGLE_REFRESH_TOKEN"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )
    # Refresh to get valid access token
    creds.refresh(Request())
    return build("youtube", "v3", credentials=creds)


def upload_video(
    video_path: str,
    thumbnail_path: str,
    metadata: Dict[str, Any],
    privacy: str = "private",
) -> Dict[str, str]:
    """
    Upload video to YouTube with metadata and thumbnail.
    Returns: {"video_id": str, "youtube_url": str}
    """
    if privacy not in PRIVACY_OPTIONS:
        privacy = "private"

    youtube = _build_youtube_client()

    # Resolve category ID
    category_name = metadata.get("category", "Education")
    category_id = YOUTUBE_CATEGORY_IDS.get(category_name, "27")

    # Build tags list (max 500 chars total)
    tags = metadata.get("tags", [])
    hashtags = metadata.get("hashtags", [])
    all_tags = tags + [f"#{h}" for h in hashtags]

    body = {
        "snippet": {
            "title": metadata.get("title", "Amazing Video")[:100],
            "description": metadata.get("description", "")[:5000],
            "tags": all_tags[:30],  # YouTube max 30 tags
            "categoryId": category_id,
            "defaultLanguage": "en",
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": False,
        },
    }

    # Upload video file
    media = MediaFileUpload(
        video_path,
        mimetype="video/mp4",
        resumable=True,
        chunksize=1024 * 1024 * 10,  # 10MB chunks
    )

    print("[YouTube] Starting video upload...")
    request = youtube.videos().insert(
        part=",".join(body.keys()),
        body=body,
        media_body=media,
    )

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            progress = int(status.progress() * 100)
            print(f"[YouTube] Upload progress: {progress}%")

    video_id = response["id"]
    print(f"[YouTube] Upload complete. Video ID: {video_id}")

    # Set thumbnail
    if thumbnail_path and os.path.exists(thumbnail_path):
        try:
            youtube.thumbnails().set(
                videoId=video_id,
                media_body=MediaFileUpload(thumbnail_path, mimetype="image/jpeg"),
            ).execute()
            print("[YouTube] Thumbnail set successfully.")
        except HttpError as e:
            print(f"[YouTube] Warning: Could not set thumbnail: {e}")

    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    return {"video_id": video_id, "youtube_url": youtube_url}
