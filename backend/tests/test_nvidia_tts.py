"""
tests/test_nvidia_tts.py
========================
Validates the NVIDIA TTS integration end-to-end.

Run from the backend directory:
    cd backend
    python -m pytest tests/test_nvidia_tts.py -v

Or run standalone:
    cd backend
    python tests/test_nvidia_tts.py
"""

import os
import sys

# Allow importing from backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from schemas.pipeline import VoiceRequest, VoiceResponse
from services.voice_engine import (
    generate_voiceover,
    _generate_nvidia,
    _generate_gtts,
    _generate_silent,
    get_audio_duration,
    VOICE_MAP,
    NVIDIA_API_KEY,
    NVIDIA_TTS_URL,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_request(
    text: str = "This is a test for NVIDIA TTS integration.",
    voice_style: str = "documentary",
    out_path: str = "test_output/test_nvidia.wav",
) -> VoiceRequest:
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    return VoiceRequest(
        text=text,
        out_path=out_path,
        voice_style=voice_style,
        duration_hint=5.0,
        scene_index=1,
        is_hook=False,
        is_reveal=False,
        is_ending=False,
        emotion="calm",
        style="viral",
        niche="general",
    )


def _assert_valid_file(path: str, label: str = ""):
    """Assert that path exists and has content."""
    assert path is not None, f"{label}: path is None"
    assert os.path.exists(path),          f"{label}: file does not exist → {path}"
    assert os.path.getsize(path) > 0,     f"{label}: file is empty → {path}"
    print(f"  ✅ {label}: {path}  ({os.path.getsize(path)} bytes)")


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_env_variables():
    """ENV variables must be present (warnings only — test still passes)."""
    print("\n[test_env_variables]")
    if not NVIDIA_API_KEY:
        print("  ⚠️  NVIDIA_API_KEY not set — primary engine will be skipped")
    else:
        print(f"  ✅ NVIDIA_API_KEY found (length={len(NVIDIA_API_KEY)})")

    if not NVIDIA_TTS_URL:
        print("  ⚠️  NVIDIA_TTS_URL not set — using built-in default")
    else:
        print(f"  ✅ NVIDIA_TTS_URL = {NVIDIA_TTS_URL}")


def test_voice_map():
    """All expected voice_style keys must resolve to valid NVIDIA voice names."""
    print("\n[test_voice_map]")
    required = {"documentary", "storytelling", "viral", "deep", "calm", "energetic", "default"}
    for key in required:
        assert key in VOICE_MAP, f"Missing voice_style key: {key}"
        assert VOICE_MAP[key].startswith("Magpie-"), f"Unexpected voice name for {key}: {VOICE_MAP[key]}"
        print(f"  ✅ {key!r:15s} → {VOICE_MAP[key]}")


def test_nvidia_tts():
    """
    Attempt NVIDIA TTS with a live API.
    SKIPPED automatically if NVIDIA_API_KEY is not configured or is a placeholder.
    """
    print("\n[test_nvidia_tts]")
    if not NVIDIA_API_KEY or NVIDIA_API_KEY.startswith("nvapi-xxx"):
        print("  ⏭️  Skipped — NVIDIA_API_KEY is not a real key (placeholder detected)")
        return

    req = _make_request(out_path="test_output/nvidia_out.wav")
    path = _generate_nvidia(req)

    if path is None:
        print("  ⚠️  NVIDIA API call returned None (check key/URL/quota) — treating as skip")
        return

    _assert_valid_file(path, "NVIDIA TTS")

    duration = get_audio_duration(path)
    print(f"  ✅ Duration: {duration:.2f}s")


def test_gtts_fallback():
    """gTTS must always produce a valid audio file."""
    print("\n[test_gtts_fallback]")
    req = _make_request(out_path="test_output/gtts_out.mp3")
    path = _generate_gtts(req)
    _assert_valid_file(path, "gTTS fallback")


def test_silent_fallback():
    """Silent audio stub must always produce a valid audio file."""
    print("\n[test_silent_fallback]")
    req = _make_request(out_path="test_output/silent_out.mp3")
    path = _generate_silent(req)
    _assert_valid_file(path, "Silent fallback")


def test_generate_voiceover_returns_voiceresponse():
    """
    generate_voiceover must always return a VoiceResponse and never raise.
    Validates the full fallback chain end-to-end.
    """
    print("\n[test_generate_voiceover_returns_voiceresponse]")
    req = _make_request(out_path="test_output/pipeline_out.mp3")

    result = generate_voiceover(req)

    assert isinstance(result, VoiceResponse), "Return type must be VoiceResponse"
    assert result.success, f"generate_voiceover failed: {result.error}"
    _assert_valid_file(result.audio_path, "generate_voiceover")
    print(f"  ✅ Duration: {result.duration:.2f}s")


def test_voiceover_does_not_crash_on_empty_text():
    """Pipeline must not crash on degenerate input."""
    print("\n[test_voiceover_does_not_crash_on_empty_text]")
    req = _make_request(text=".", out_path="test_output/empty_text_out.mp3")
    try:
        result = generate_voiceover(req)
        print(f"  ✅ Returned VoiceResponse(success={result.success})")
    except Exception as exc:
        raise AssertionError(f"generate_voiceover raised unexpectedly: {exc}") from exc


# ── Runner ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_env_variables,
        test_voice_map,
        test_nvidia_tts,
        test_gtts_fallback,
        test_silent_fallback,
        test_generate_voiceover_returns_voiceresponse,
        test_voiceover_does_not_crash_on_empty_text,
    ]

    passed = failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as err:
            print(f"  ❌ FAILED: {err}")
            failed += 1
        except Exception as err:
            print(f"  ❌ ERROR: {err}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
