"""
Voice Engine
============
Generates human-like voiceovers using:
- NVIDIA NIM TTS (primary — REST API via NVIDIA_TTS_URL)
- gTTS             (fallback 1)
- Silent audio     (fallback 2 / last resort)

Environment variables required:
    NVIDIA_API_KEY  — nvapi-xxxx key from build.nvidia.com
    NVIDIA_TTS_URL  — REST endpoint for the NIM TTS model

Also cleans AI-enhanced scripts (CAPS → normal, ... → pauses).
"""

import os
import re
import base64
import logging
import subprocess
import time
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── NVIDIA Configuration ──────────────────────────────────────────────────────
NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_TTS_URL: str = os.getenv(
    "NVIDIA_TTS_URL",
    "https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/nvidia/tts/api",
)

# ── Voice Mapping: voice_style → NVIDIA Magpie-Multilingual voice name ────────
NVIDIA_AVAILABLE = True

VOICE_MAP: dict[str, str] = {
    "documentary": "Magpie-Multilingual.EN-US.Leo",
    "storytelling": "Magpie-Multilingual.EN-US.Aria",
    "viral":        "Magpie-Multilingual.EN-US.Aria.Happy",
    "deep":         "Magpie-Multilingual.EN-US.Leo",
    "calm":         "Magpie-Multilingual.EN-US.Aria.Calm",
    "energetic":    "Magpie-Multilingual.EN-US.Aria.Happy",
    "default":      "Magpie-Multilingual.EN-US.Aria",
}

# ── Text Cleaning ─────────────────────────────────────────────────────────────

def _clean_for_tts(
    text: str,
    is_elevenlabs: bool = False,
    emotion: str = "calm",
    is_hook: bool = False,
    is_reveal: bool = False,
    is_ending: bool = False,
) -> str:
    """Prepare text for TTS: strip SSML tags, limit CAPS emphasis, normalise pauses."""

    # Emphasis Control — keep at most 2 ALL-CAPS words
    words = text.split()
    caps_count = 0
    cleaned_words = []
    for w in words:
        clean_w = re.sub(r"[^A-Z]", "", w)
        if len(clean_w) > 1 and w == w.upper():
            if caps_count < 2:
                caps_count += 1
                cleaned_words.append(w)
            else:
                cleaned_words.append(w.lower())
        else:
            cleaned_words.append(w)
    text = " ".join(cleaned_words)

    # Normalise ellipsis / em-dash → plain pauses (safe for any TTS engine)
    text = text.replace("...", ", ")
    text = text.replace("—", ", ")
    text = text.replace("?!", "? ")

    # Strip any leftover SSML tags
    text = re.sub(r"<[^>]+>", "", text)

    return text.strip()


# ── NVIDIA NIM TTS ────────────────────────────────────────────────────────────

def _generate_nvidia(req) -> Optional[str]:
    """
    Call the NVIDIA NIM TTS REST API to synthesise speech.

    Handles both:
      • Binary audio response  (Content-Type: audio/*)
      • JSON response with base64-encoded audio field

    Retries up to 3 times with exponential back-off.
    Returns the output path on success, or None on failure.
    """
    global NVIDIA_AVAILABLE

    if not NVIDIA_AVAILABLE:
        logger.warning("[voice_engine] NVIDIA disabled due to previous failure")
        return None

    if not NVIDIA_API_KEY or not NVIDIA_TTS_URL:
        logger.warning("[voice_engine] NVIDIA_API_KEY or NVIDIA_TTS_URL not set — skipping")
        return None

    voice = VOICE_MAP.get(getattr(req, "voice_style", "default"), VOICE_MAP["default"])
    text  = _clean_for_tts(
        req.text,
        is_hook=getattr(req, "is_hook", False),
        is_reveal=getattr(req, "is_reveal", False),
        is_ending=getattr(req, "is_ending", False),
        emotion=getattr(req, "emotion", "calm"),
    )

    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "input": text,
        "voice": voice,
        "format": "wav",
    }

    os.makedirs(os.path.dirname(os.path.abspath(req.out_path)), exist_ok=True)

    for attempt in range(3):
        try:
            resp = requests.post(
                NVIDIA_TTS_URL,
                json=payload,
                headers=headers,
                timeout=20,
            )

            if resp.status_code != 200:
                raise RuntimeError(
                    f"HTTP {resp.status_code}: {resp.text[:200]}"
                )

            content_type = resp.headers.get("Content-Type", "")

            # ── Case 1: Binary audio stream ──────────────────────────────────
            if "audio" in content_type:
                with open(req.out_path, "wb") as fh:
                    fh.write(resp.content)

            # ── Case 2: JSON with base64-encoded audio ───────────────────────
            else:
                data = resp.json()
                audio_b64 = data.get("audio") or data.get("audio_content")
                if not audio_b64:
                    raise RuntimeError("Response JSON has no audio field")
                with open(req.out_path, "wb") as fh:
                    fh.write(base64.b64decode(audio_b64))

            # ── Validate output ──────────────────────────────────────────────
            if os.path.exists(req.out_path) and os.path.getsize(req.out_path) > 0:
                logger.info(
                    "[voice_engine] NVIDIA success (voice=%s) → %s",
                    voice, os.path.basename(req.out_path),
                )
                return req.out_path

            raise RuntimeError("Output file is empty after write")

        except Exception as exc:
            wait = 2 ** attempt
            logger.warning(
                "[voice_engine] NVIDIA attempt %d/3 failed: %s  (retry in %ds)",
                attempt + 1, exc, wait,
            )
            if attempt == 2:
                NVIDIA_AVAILABLE = False
                logger.error("[voice_engine] NVIDIA disabled after repeated failures")
            time.sleep(wait)

    logger.error("[voice_engine] NVIDIA TTS failed after 3 attempts")
    return None


# ── gTTS Fallback ─────────────────────────────────────────────────────────────

def _generate_gtts(req) -> Optional[str]:
    """Generate audio via gTTS. Returns output path or None."""
    try:
        from gtts import gTTS

        clean = _clean_for_tts(
            req.text,
            is_hook=getattr(req, "is_hook", False),
            is_reveal=getattr(req, "is_reveal", False),
            is_ending=getattr(req, "is_ending", False),
        )
        tts = gTTS(clean, lang="en", slow=False)
        tts.save(req.out_path)
        if os.path.exists(req.out_path) and os.path.getsize(req.out_path) > 0:
            logger.info("[voice_engine] gTTS success → %s", os.path.basename(req.out_path))
            return req.out_path
    except Exception as exc:
        logger.warning("[voice_engine] gTTS failed: %s", exc)
    return None


# ── Silent Audio Fallback ─────────────────────────────────────────────────────

def _generate_silent(req) -> Optional[str]:
    """Generate a silent MP3 stub as final fallback. Returns output path or None."""
    duration = getattr(req, "duration_hint", 4.0)
    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", "anullsrc=r=44100:cl=stereo",
            "-t", str(duration),
            "-c:a", "libmp3lame",
            "-q:a", "9",
            req.out_path,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=15)
        if r.returncode == 0 and os.path.exists(req.out_path) and os.path.getsize(req.out_path) > 0:
            logger.warning("[voice_engine] Silent audio injected → %s", os.path.basename(req.out_path))
            return req.out_path
    except Exception as exc:
        logger.error("[voice_engine] Silent audio generation failed: %s", exc)
    return None


# ── Audio Duration Probe ──────────────────────────────────────────────────────

def get_audio_duration(audio_path: str, fallback: float = 4.0) -> float:
    """Return duration in seconds via ffprobe, or fallback."""
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True, text=True, timeout=10,
        )
        return float(r.stdout.strip())
    except Exception:
        return fallback


# ── Public Entry Point ────────────────────────────────────────────────────────

from schemas.pipeline import VoiceRequest, VoiceResponse


def generate_voiceover(request: VoiceRequest) -> VoiceResponse:
    """
    Generate a voiceover for the given VoiceRequest.

    Priority chain (never crashes):
        1. NVIDIA NIM TTS  (primary)
        2. gTTS            (fallback 1)
        3. Silent audio    (fallback 2 / fail-safe)

    Returns a VoiceResponse – always succeeds unless all three methods fail
    AND the filesystem is unwritable.
    """
    os.makedirs(os.path.dirname(os.path.abspath(request.out_path)), exist_ok=True)

    # ── 1. NVIDIA (Primary) ───────────────────────────────────────────────────
    path = _generate_nvidia(request)
    if path:
        return VoiceResponse(
            success=True,
            audio_path=path,
            duration=get_audio_duration(path, fallback=request.duration_hint),
        )

    logger.warning("[voice_engine] NVIDIA failed → trying gTTS")

    # ── 2. gTTS (Fallback 1) ─────────────────────────────────────────────────
    path = _generate_gtts(request)
    if path:
        return VoiceResponse(
            success=True,
            audio_path=path,
            duration=get_audio_duration(path, fallback=request.duration_hint),
        )

    logger.warning("[voice_engine] gTTS failed → trying silent audio")

    # ── 3. Silent audio (Fallback 2 / fail-safe) ─────────────────────────────
    path = _generate_silent(request)
    if path:
        return VoiceResponse(
            success=True,
            audio_path=path,
            duration=request.duration_hint,
        )

    # All three methods exhausted — return clean error, do NOT raise
    logger.error("[voice_engine] All TTS methods failed for %s", request.out_path)
    return VoiceResponse(success=False, error="All TTS methods failed (NVIDIA + gTTS + silent)")
