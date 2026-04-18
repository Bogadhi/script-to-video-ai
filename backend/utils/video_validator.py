"""
Video validation utilities for the ScriptToVideo QA step.

validate_video()     — checks duration, frame count, file size
validate_thumbnail() — checks file size (> 5 KB)
validate_srt()       — checks UTF-8 readability, non-empty
validate_metadata()  — checks title, tags, JSON decodability
probe_duration()     — ffprobe duration helper
probe_frame_count()  — ffprobe frame count helper (catches green-screen / blank output)
"""

import os
import json
import logging
import subprocess

logger = logging.getLogger(__name__)


# ── ffprobe helpers ───────────────────────────────────────────────────────────

def probe_duration(path: str) -> float:
    """Return exact duration in seconds via ffprobe, 0.0 on error."""
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True, timeout=15,
        )
        return max(0.0, float(r.stdout.strip()))
    except Exception:
        return 0.0


def probe_frame_count(path: str) -> int:
    """
    Return the number of video frames using ffprobe packet counting.
    Returns -1 on error.  A valid 1080p 5-second clip should have ~150 frames.
    """
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-count_packets",
                "-show_entries", "stream=nb_read_packets",
                "-of", "csv=p=0",
                path,
            ],
            capture_output=True, timeout=30,
        )
        raw = r.stdout.strip()
        if raw.isdigit():
            return int(raw)
        return -1
    except Exception:
        return -1


def probe_video_format(path: str) -> dict:
    """
    Return video stream format info (codec, pix_fmt, profile, level, r_frame_rate)
    """
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name,profile,level,pix_fmt,r_frame_rate",
                "-of", "json",
                path,
            ],
            capture_output=True, timeout=10,
        )
        data = json.loads(r.stdout)
        streams = data.get("streams", [])
        if streams:
            return streams[0]
        return {}
    except Exception:
        return {}


def probe_has_audio(path: str) -> bool:
    """Return True if the file has at least one audio stream."""
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=index",
                "-of", "csv=p=0",
                path,
            ],
            capture_output=True, timeout=10,
        )
        return bool(r.stdout.strip())
    except Exception:
        return False


# ── individual validators ─────────────────────────────────────────────────────

def validate_video(path: str) -> list[str]:
    """
    Return a list of error strings.  Empty list = valid video.

    Checks:
    - File exists
    - File size > 50 KB
    - Duration > 3.0 s
    - Frame count > 10  (catches blank / green-screen output)
    """
    errors: list[str] = []

    if not os.path.isfile(path):
        errors.append(f"VIDEO NOT FOUND: {path}")
        return errors  # no point probing

    size = os.path.getsize(path)
    if size < 50_000:
        errors.append(f"VIDEO TOO SMALL: {size} bytes (expected > 50 KB)")

    dur = probe_duration(path)
    if dur < 3.0:
        errors.append(f"VIDEO TOO SHORT: {dur:.2f}s (minimum 3s)")

    frames = probe_frame_count(path)
    if frames == -1:
        errors.append("VIDEO FRAME COUNT: ffprobe failed — file may be unreadable")
    elif frames < 10:
        errors.append(f"VIDEO NEAR-BLANK: only {frames} frames detected (expected > 10) — possible green screen")

    # Strict browser compatibility check
    fmt = probe_video_format(path)
    if not fmt:
        errors.append("VIDEO FORMAT UNKNOWN: ffprobe could not read streams")
    else:
        if fmt.get("codec_name") != "h264":
            errors.append(f"VIDEO CODEC INVALID: {fmt.get('codec_name')} (expected h264)")
        if fmt.get("pix_fmt") != "yuv420p":
            errors.append(f"VIDEO PIXEL FORMAT INVALID: {fmt.get('pix_fmt')} (expected yuv420p)")
        prof = fmt.get("profile", "").lower()
        if prof not in ("main", "baseline", "high"):
            errors.append(f"VIDEO PROFILE INVALID: {prof} (expected main or baseline)")

    if errors:
        logger.error("validate_video FAILED for %s: %s", path, errors)
    else:
        logger.info("validate_video PASSED: %s  (%.1fs, %d frames, %d bytes)", path, dur, frames, size)

    return errors


def validate_thumbnail(path: str) -> list[str]:
    """
    Return a list of error strings.  Empty list = valid thumbnail.

    Checks:
    - File exists
    - File size > 5 KB  (a 0-byte or placeholder file fails this)
    """
    errors: list[str] = []

    if not os.path.isfile(path):
        errors.append(f"THUMBNAIL NOT FOUND: {path}")
        return errors

    size = os.path.getsize(path)
    if size < 5_000:
        errors.append(f"THUMBNAIL TOO SMALL: {size} bytes (expected > 5 KB) — likely corrupt or blank")

    if errors:
        logger.error("validate_thumbnail FAILED: %s", errors)
    else:
        logger.info("validate_thumbnail PASSED: %s (%d bytes)", path, size)

    return errors


def validate_srt(path: str) -> list[str]:
    """
    Return a list of error strings. Empty = valid SRT.

    Checks:
    - File exists
    - UTF-8 decodable (no encoding corruption)
    - Non-empty (> 10 bytes)
    - Contains at least one SRT entry (digit line + --> arrow)
    """
    errors: list[str] = []

    if not os.path.isfile(path):
        errors.append(f"SUBTITLES NOT FOUND: {path}")
        return errors

    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError as e:
        errors.append(f"SUBTITLES ENCODING ERROR: {e}")
        return errors

    if len(content.strip()) < 10:
        errors.append("SUBTITLES EMPTY: file has < 10 bytes of content")
    elif "-->" not in content:
        errors.append("SUBTITLES MALFORMED: no SRT timestamps found")

    if not errors:
        logger.info("validate_srt PASSED: %s", path)

    return errors


def validate_metadata(path: str) -> list[str]:
    """
    Return a list of error strings.  Empty = valid metadata.

    Checks:
    - File exists
    - Valid JSON
    - Has non-empty title
    - Title <= 60 characters
    - Has at least 3 tags
    """
    errors: list[str] = []

    if not os.path.isfile(path):
        errors.append(f"METADATA NOT FOUND: {path}")
        return errors

    try:
        with open(path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        errors.append(f"METADATA CORRUPT JSON: {e}")
        return errors

    title = meta.get("title", "").strip()
    if not title:
        errors.append("METADATA: title is empty")
    elif len(title) > 60:
        errors.append(f"METADATA: title too long ({len(title)} chars > 60)")

    tags = meta.get("tags", [])
    if not isinstance(tags, list) or len(tags) < 3:
        errors.append(f"METADATA: tags list has < 3 entries ({len(tags) if isinstance(tags, list) else 'invalid'})")

    if not errors:
        logger.info("validate_metadata PASSED: %s", path)

    return errors


# ── full QA report ─────────────────────────────────────────────────────────────

def run_qa(project_dir: str) -> dict:
    """
    Run all validators on a completed project.

    Returns:
    {
        "passed": bool,
        "errors": [...],
        "warnings": [...]
    }
    """
    errors: list[str] = []
    warnings: list[str] = []

    errors += validate_video(os.path.join(project_dir, "final.mp4"))
    errors += validate_thumbnail(os.path.join(project_dir, "thumbnail.jpg"))

    srt_issues = validate_srt(os.path.join(project_dir, "subtitles.srt"))
    warnings += srt_issues  # SRT is non-fatal

    errors += validate_metadata(os.path.join(project_dir, "metadata", "youtube.json"))

    return {
        "passed": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }
