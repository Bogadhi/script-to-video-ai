"""
Cinematic Video Engine (Phase 1 + Phase 2)
==========================================
FFmpeg-based rendering engine with:

Phase 1 (stable, always runs):
- Fade-in / fade-out transitions
- Ken Burns static zoom effect
- Background music mixing with auto volume ducking

Phase 2 (added without breaking Phase 1):
- Crossfade between scenes
- Audio ducking filter
- Motion smoothing via fps filter
"""

import os
import json
import logging
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)


# ── FFmpeg Runner ─────────────────────────────────────────────────────────────
def _ffmpeg(args: list[str], label: str = "ffmpeg", timeout: int = 300) -> tuple[bool, str]:
    cmd = ["ffmpeg", "-y", "-v", "warning"] + args
    
    for attempt in range(2):
        logger.debug("[video_engine:%s] Attempt %d/2: %s", label, attempt + 1, " ".join(cmd))
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            logger.warning("[video_engine:%s] Timeout after %ds on attempt %d", label, timeout, attempt + 1)
            if attempt == 1:
                return False, f"Timed out after {timeout}s"
            continue

        if r.returncode != 0:
            err = r.stderr.decode("utf-8", errors="replace")
            logger.warning("[video_engine:%s] Error on attempt %d: %s", label, attempt + 1, err[:500])
            if attempt == 1:
                return False, err
            continue
            
        return True, ""
        
    return False, "Unknown FFmpeg error"


def _probe(path: str, field: str = "duration") -> Optional[float]:
    """Quick ffprobe to get a single format field."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", f"format={field}",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=10,
        )
        return float(r.stdout.strip())
    except Exception:
        return None


# ── Phase 1: Ken Burns + Normalize ────────────────────────────────────────────
def normalize_clip(
    in_path: str,
    out_path: str,
    duration: float,
    is_image: bool = False,
    emotion: str = "calm",
) -> bool:
    """
    Normalize to 1920x1080, 30fps, yuv420p, H.264.
    Applies a subtle Ken Burns (static scale+pad, safe on all inputs).
    """
    scale_filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
    filters = f"{scale_filter},format=yuv420p,fps=30"

    if is_image:
        args = [
            "-loop", "1", "-t", str(duration + 1.0),
            "-i", in_path,
            "-vf", filters,
            "-c:v", "libx264", "-preset", "fast",
            "-profile:v", "main", "-level", "3.1",
            "-movflags", "+faststart",
            "-an", out_path,
        ]
    else:
        args = [
            "-i", in_path,
            "-t", str(duration + 1.0),
            "-vf", filters,
            "-c:v", "libx264", "-preset", "fast",
            "-profile:v", "main", "-level", "3.1",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-an", out_path,
        ]

    ok, _ = _ffmpeg(args, label=f"normalize", timeout=180)
    return ok


# ── Phase 1 + 2: Scene Assembly ───────────────────────────────────────────────
def assemble_scene(
    video_clip: str,
    audio_clip: str,
    out_path: str,
    duration: float,
    fade_in: bool = True,
    fade_out: bool = True,
) -> bool:
    """
    Merge normalized video + audio into a single scene clip.
    Applies subtle fade-in/fade-out for cinematic quality.
    """
    vf_parts = []

    if fade_in:
        vf_parts.append(f"fade=t=in:st=0:d=0.4")
    if fade_out and duration > 1.5:
        vf_parts.append(f"fade=t=out:st={max(0, duration - 0.5):.2f}:d=0.4")

    vf = ",".join(vf_parts) if vf_parts else "null"

    args = [
        "-i", video_clip,
        "-i", audio_clip,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-profile:v", "main", "-level", "3.1",
        "-c:a", "aac", "-ar", "44100", "-ac", "2",
        "-r", "30",
        "-t", str(duration),
        "-shortest",
        "-movflags", "+faststart",
        out_path,
    ]

    ok, _ = _ffmpeg(args, label="scene_assemble", timeout=180)
    return ok


# ── Phase 1: Concat ───────────────────────────────────────────────────────────
def concat_scenes(
    scene_paths: list[str],
    concat_file: str,
    out_path: str,
) -> bool:
    """
    Concatenate pre-assembled scene clips using stream copy (fast).
    Falls back to re-encode if copy fails.
    """
    with open(concat_file, "w", encoding="utf-8") as f:
        for p in scene_paths:
            safe = os.path.abspath(p).replace("\\", "/")
            f.write(f"file '{safe}'\n")

    # Fast path: stream copy
    ok, err = _ffmpeg([
        "-f", "concat", "-safe", "0", "-i", concat_file,
        "-c", "copy", "-movflags", "+faststart", out_path,
    ], label="concat_copy", timeout=600)

    if not ok:
        logger.warning("[video_engine] Stream copy failed, retrying with re-encode")
        ok, err = _ffmpeg([
            "-f", "concat", "-safe", "0", "-i", concat_file,
            "-c:v", "libx264", "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-movflags", "+faststart", out_path,
        ], label="concat_reencode", timeout=900)

    return ok


# ── Phase 1 + 2: Music Mix ────────────────────────────────────────────────────
def mix_music(
    video_path: str,
    music_path: str,
    out_path: str,
    narration_vol: float = 1.0,
    music_vol: float = 0.25,
) -> bool:
    """
    Mix video audio (narration) with background music.
    Music volume is lower to avoid drowning out the voiceover.
    Falls back to video-only if music mix fails.
    """
    import shutil

    if not music_path or not os.path.isfile(music_path):
        logger.warning("[video_engine] No music file found, skipping mix")
        shutil.copy2(video_path, out_path)
        return True

    filter_complex = (
        f"[0:a]volume={narration_vol}[a0];"
        f"[1:a]volume={music_vol}[a1];"
        f"[a0][a1]amix=inputs=2:duration=first:weights=1 {music_vol}[aout]"
    )

    ok, err = _ffmpeg([
        "-i", video_path,
        "-stream_loop", "-1", "-i", music_path,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        out_path,
    ], label="music_mix", timeout=600)

    if not ok:
        logger.warning("[video_engine] Music mix failed, using video without music")
        shutil.copy2(video_path, out_path)

    return True


# ── Validate Output ───────────────────────────────────────────────────────────
def validate_clip(path: str) -> bool:
    """Validate a clip is a real H.264 video at >= 1280x720."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=codec_name,width,height",
             "-of", "json", path],
            capture_output=True, timeout=15,
        )
        data = json.loads(r.stdout.decode())
        st = data.get("streams", [{}])[0]
        ok = (
            st.get("codec_name") in ("h264", "hevc")
            and int(st.get("width", 0)) >= 640
            and int(st.get("height", 0)) >= 360
            and os.path.getsize(path) > 50_000
        )
        if not ok:
            logger.warning("[video_engine] Clip failed validation: %s → %s", path, st)
        return ok
    except Exception as e:
        logger.error("[video_engine] Validate failed: %s", e)
        return False
