"""
Quality Gate — Output Validation & Auto-Repair
==============================================
Post-generation validation that ensures minimum quality threshold.
Checks: voice, media coverage, duration, thumbnail readability.
Auto-retries failed components without regenerating entire pipeline.
"""

import os
import json
import subprocess
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Minimum quality thresholds ───────────────────────────────────────────────
MIN_DURATION_SEC = 20.0          # Hard fail: Video must be at least 20s
MIN_MEDIA_COVERAGE = 0.60        # Hard fail: 60% of scenes must have valid media
MIN_RESOLUTION_WIDTH = 640       # Reject media narrower than 640px
MIN_RESOLUTION_HEIGHT = 360      # Reject media shorter than 360px
MAX_THUMB_TEXT_WORDS = 5         # Thumbnail text max 5 words
MIN_AUDIO_SIZE_BYTES = 5_000     # Reject audio files < 5KB


def probe_resolution(filepath: str) -> tuple[int, int]:
    """Get width x height of a media file."""
    try:
        cmd = [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0", filepath
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        parts = r.stdout.strip().split("x")
        if len(parts) == 2:
            return int(parts[0]), int(parts[1])
    except Exception:
        pass
    return 0, 0


def probe_duration(filepath: str) -> float:
    """Get duration in seconds."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", filepath],
            capture_output=True, text=True, timeout=10
        )
        return float(r.stdout.strip())
    except Exception:
        return 0.0


# ── Task 1: Output Validation Gate ───────────────────────────────────────────

def validate_output(project_dir: str, scenes: list[dict], style: str = "viral") -> dict:
    """
    Validate final output quality with a 0-100 scoring engine.
    Returns:
    {
        "passed": bool,
        "score": int,
        "action": "deliver" | "retry" | "fallback",
        "voice_ok": bool,
        "media_coverage": float,
        "duration_ok": bool,
        "duration_sec": float,
        "failed_scenes": [int, ...],
        "issues": [str, ...]
    }
    """
    issues = []
    failed_scene_indices = []

    # 1. Check voice files exist & are non-trivial
    voice_ok = True
    audio_dir = os.path.join(project_dir, "scenes", "audio")
    for scene in scenes:
        idx = scene["index"]
        audio_path = scene.get("audio_file") or os.path.join(audio_dir, f"audio_{idx:03d}.mp3")
        if not os.path.isfile(audio_path):
            voice_ok = False
            failed_scene_indices.append(idx)
            issues.append(f"Scene {idx}: missing audio file")
        elif os.path.getsize(audio_path) < MIN_AUDIO_SIZE_BYTES:
            voice_ok = False
            failed_scene_indices.append(idx)
            issues.append(f"Scene {idx}: audio too small ({os.path.getsize(audio_path)} bytes)")

    # 2. Check media coverage
    clips_dir = os.path.join(project_dir, "scenes", "clips")
    valid_clips = 0
    for scene in scenes:
        idx = scene["index"]
        clip_path = scene.get("video_clip") or os.path.join(clips_dir, f"clip_{idx:03d}.mp4")
        if os.path.isfile(clip_path) and os.path.getsize(clip_path) > 50_000:
            valid_clips += 1
        else:
            if idx not in failed_scene_indices:
                failed_scene_indices.append(idx)
            issues.append(f"Scene {idx}: missing or invalid media clip")

    media_coverage = valid_clips / max(len(scenes), 1)
    if media_coverage < MIN_MEDIA_COVERAGE:
        issues.append(f"Media coverage {media_coverage:.0%} < minimum required {MIN_MEDIA_COVERAGE:.0%}")

    # 3. Check final video duration
    final_path = os.path.join(project_dir, "final.mp4")
    duration = probe_duration(final_path) if os.path.isfile(final_path) else 0.0
    duration_ok = duration >= MIN_DURATION_SEC
    if not duration_ok:
        issues.append(f"Final video duration {duration:.1f}s < minimum {MIN_DURATION_SEC}s")

    # 4. Visual/Voice Mismatch
    mismatch = False
    for scene in scenes:
        a_dur = scene.get("duration_sec", 0.0)
        v_clip = scene.get("video_clip") or os.path.join(clips_dir, f"clip_{scene['index']:03d}.mp4")
        if os.path.isfile(v_clip):
            v_dur = probe_duration(v_clip)
            if a_dur > 0 and v_dur > 0 and abs(a_dur - v_dur) > 1.5:
                mismatch = True
                if scene['index'] not in failed_scene_indices:
                    failed_scene_indices.append(scene['index'])
                issues.append(f"Scene {scene['index']}: Visual/Voice mismatch")

    # 5. Director's Truth Validation (Phase 31)
    # - Reject if ANY sentence > 12 words (The "Wall")
    # - Reject if Hook doesn't trigger contradiction/curiosity
    script_ok = True
    for scene in scenes:
        text = scene.get("text", "")
        if len(text.split()) > 12:
            script_ok = False
            issues.append(f"REJECT: Scene {scene['index']} exceeds 12-word wall ({len(text.split())} words)")
    
    if scenes:
        hook_text = scenes[0].get("text", "").lower()
        if "..." not in hook_text and "—" not in hook_text:
            script_ok = False
            issues.append("REJECT: Hook lacks cinematic pacing (no pauses)")
        
        # Meaner Hook Strength
        hook_metrics = validate_hook_strength(hook_text)
        if hook_metrics["score"] < 2:
            script_ok = False
            issues.append(f"REJECT: Hook too weak (score={hook_metrics['score']})")

    # 6. Sentence Structure (Emphasis) Check
    structure_ok = True
    for scene in scenes:
        text = scene.get("text", "")
        caps_count = len([w for w in text.split() if w.isupper() and len(w) > 1])
        if caps_count > 2:
            structure_ok = False
            issues.append(f"Scene {scene['index']}: too much emphasis ({caps_count} caps words)")

    # 7. Style Pacing Consistency (Phase 19)
    pacing_ok = validate_pacing_consistency(scenes, style)
    if not pacing_ok:
        issues.append(f"Pacing inconsistent with style '{style}'")

    # Enforce Threshold Actions
    if voice_ok and media_coverage >= MIN_MEDIA_COVERAGE and duration_ok and is_cinematic and script_ok:
        # Calculate Score
        score += 40  # Base logic pass
        score += int(media_coverage * 20)
        score += 20 if is_cinematic else 0
        score += 20 if script_ok else 0
        
        if len(scenes) >= 5: score += 10
        if duration >= 20.0: score += 10

    # Enforce Threshold Actions
    if score >= 90 and script_ok and is_cinematic:
        action = "deliver"
    elif score >= 1 or not is_cinematic or not script_ok:
        action = "retry"
    else:
        action = "fallback"

    report = {
        "passed": action == "deliver",
        "score": score,
        "action": action,
        "voice_ok": voice_ok,
        "media_coverage": media_coverage,
        "duration_ok": duration_ok,
        "duration_sec": duration,
        "failed_scenes": sorted(set(failed_scene_indices)),
        "issues": issues,
    }

    if action == "deliver":
        logger.info("[quality_gate] PASSED (Score: %d) — duration=%.1fs, media=%.0f%%",
                    score, duration, media_coverage * 100)
    else:
        logger.warning("[quality_gate] %s (Score: %d) — %d issues: %s", 
                       action.upper(), score, len(issues), "; ".join(issues))

    return report


# ── Task 2: Media Quality Filter ────────────────────────────────────────────

def check_media_quality(filepath: str, min_width: int = MIN_RESOLUTION_WIDTH,
                        min_height: int = MIN_RESOLUTION_HEIGHT) -> bool:
    """Reject low-resolution media. Returns True if quality is acceptable."""
    if not os.path.isfile(filepath):
        return False

    w, h = probe_resolution(filepath)
    if w < min_width or h < min_height:
        logger.warning("[quality_gate] Media rejected: %dx%d < %dx%d (%s)",
                      w, h, min_width, min_height, os.path.basename(filepath))
        return False

    return True


# ── Task 3: Script Cleanup ──────────────────────────────────────────────────

# Patterns that indicate repetitive/awkward hooks
REPETITIVE_PATTERNS = [
    r"(?i)(but here's|but wait|you won't believe)\s*\.{2,}\s*(but here's|but wait|you won't believe)",
    r"(?i)(stop scrolling).*?(stop scrolling)",
    r"(?i)(this is why).*?(this is why).*?(this is why)",
]

AWKWARD_PHRASES = [
    (r"\.{4,}", "..."),                         # Fix excessive dots
    (r"\s{3,}", " "),                            # Fix excessive spaces
    (r"(CAPS|caps)\s+", ""),                     # Remove meta-instructions leaked
    (r"\[dramatic pause\]", "..."),              # Remove bracket instructions
    (r"\[pause\]", "..."),
    (r"\[beat\]", "..."),
    (r"(?i)subscribe.*subscribe", "Subscribe for more!"),  # Dedupe CTAs
]


def clean_script(text: str) -> str:
    """Remove repetitive hooks, awkward phrasing, and meta-instructions."""
    import re

    # Fix awkward phrases
    for pattern, replacement in AWKWARD_PHRASES:
        text = re.sub(pattern, replacement, text)

    # Detect and fix repetitive hooks (keep first occurrence only)
    for pattern in REPETITIVE_PATTERNS:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            # Keep text up to first occurrence, remove duplicate
            logger.debug("[quality_gate] Removing repetitive pattern: %s", pattern[:40])
            text = re.sub(pattern, match.group(1) + "...", text, count=1)

    # Ensure text doesn't start/end with whitespace or orphan punctuation
    text = text.strip().strip(",").strip()

    return text


def clean_scene_texts(scenes: list[dict]) -> list[dict]:
    """Apply script cleanup to all scene narration texts."""
    for scene in scenes:
        if "text" in scene:
            scene["text"] = clean_script(scene["text"])
    return scenes


# ── Task 4: Voice Consistency ────────────────────────────────────────────────

def detect_voice_inconsistency(scenes: list[dict]) -> dict:
    """
    Check if voice files are consistent (same engine used throughout).
    Returns: {"consistent": bool, "mixed_scenes": [indexes]}
    """
    mixed = []

    for scene in scenes:
        audio_path = scene.get("audio_file", "")
        if not audio_path or not os.path.isfile(audio_path):
            continue

        # Heuristic: gTTS produces smaller files with different codec
        size = os.path.getsize(audio_path)
        # ElevenLabs typically > 30KB for short clips, gTTS < 20KB
        if size < 8_000:
            mixed.append(scene["index"])

    consistent = len(mixed) == 0
    if not consistent:
        logger.warning("[quality_gate] Voice inconsistency detected in scenes: %s", mixed)

    return {"consistent": consistent, "mixed_scenes": mixed}


# ── Task 5: Thumbnail Text Check ────────────────────────────────────────────

def validate_thumbnail_text(text: str) -> dict:
    """
    Check if thumbnail text is suitable.
    Returns: {"valid": bool, "reason": str, "suggestion": str}
    """
    import random
    words = text.strip().split()
    fallbacks = ["THIS SHOULDN'T EXIST", "NO ONE CAN EXPLAIN THIS", "THIS IS REAL?!"]

    if len(words) > MAX_THUMB_TEXT_WORDS:
        return {
            "valid": False,
            "reason": f"Too long ({len(words)} words, max {MAX_THUMB_TEXT_WORDS})",
            "suggestion": random.choice(fallbacks)
        }

    if len(text.strip()) < 3:
        return {
            "valid": False,
            "reason": "Too short or empty",
            "suggestion": random.choice(fallbacks)
        }

    # Check for non-impactful generic text
    generic = {"watch this", "click here", "video", "check this out", "new video"}
    if text.strip().lower() in generic:
        return {
            "valid": False,
            "reason": f"Generic text: '{text}'",
            "suggestion": random.choice(fallbacks)
        }

    return {"valid": True, "reason": "OK", "suggestion": text}


def validate_hook_strength(text: str) -> dict:
    """Score hook based on curiosity, emotion, contradiction, surprise."""
    text_lower = text.lower()
    criteria = {
        "curiosity_gap": ["why", "how", "secret", "hidden", "reason", "mystery", "?", "discovered"],
        "emotional_trigger": ["heartbreaking", "terrifying", "amazing", "beautiful", "shattered", "!", "incredible"],
        "contradiction": ["wrong", "myth", "lie", "not true", "actually", "but", "however", "instead"],
        "surprise": ["shocking", "unexpected", "suddenly", "never", "first time", "unbelievable"]
    }
    
    matched = []
    for key, words in criteria.items():
        if any(w in text_lower for w in words):
            matched.append(key)
            
    return {"score": len(matched), "matched": matched}


def validate_pacing_consistency(scenes: list[dict], style: str) -> bool:
    """Ensure average duration matches style profile."""
    if not scenes: return True
    avg_dur = sum(s.get("duration_sec", 0) for s in scenes) / len(scenes)
    
    if style in ["facts", "viral"]:
        return 2.5 <= avg_dur <= 4.2
    return 3.5 <= avg_dur <= 5.5
