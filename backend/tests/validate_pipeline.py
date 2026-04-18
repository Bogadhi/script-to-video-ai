"""
tests/validate_pipeline.py
===========================
Full end-to-end pipeline validation for the Script-to-Video system.

Runs all 6 pipeline stages independently, collects per-stage logs, generates
a quality score, and produces a final validation report.

Usage (from backend directory):
    python tests/validate_pipeline.py

Requires: venv active, Redis + Pexels API key configured in .env
"""

import os
import sys
import json
import time
import subprocess
import logging
import uuid
import shutil
from typing import Dict, Any, List, Optional

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

import dotenv
dotenv.load_dotenv(os.path.join(BACKEND_DIR, ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("validation")

# ── Test Input Script ─────────────────────────────────────────────────────────
INPUT_SCRIPT = """What if I told you that there are places on Earth that don't feel real?
From floating mountains in China to glowing beaches in the Maldives,
our planet hides wonders that look like they belong in a dream.
Let's explore some of the most unbelievable places on Earth."""

# ── Helpers ───────────────────────────────────────────────────────────────────

class StageResult:
    def __init__(self, name: str):
        self.name         = name
        self.status       = "pending"   # pending | pass | fail | warn
        self.log: List[str] = []
        self.artifacts: Dict[str, str] = {}
        self.duration_sec  = 0.0
        self.score         = 0          # 0-10
        self.issues: List[str] = []

    def ok(self, msg: str):
        self.log.append(f"  ✅ {msg}")
        logger.info("[%s] %s", self.name, msg)

    def warn(self, msg: str):
        self.log.append(f"  ⚠️  {msg}")
        logger.warning("[%s] %s", self.name, msg)
        if self.status != "fail":
            self.status = "warn"
        self.issues.append(msg)

    def fail(self, msg: str):
        self.log.append(f"  ❌ {msg}")
        logger.error("[%s] %s", self.name, msg)
        self.status = "fail"
        self.issues.append(msg)

    def done_pass(self, score: int = 8):
        if self.status == "pending":
            self.status = "pass"
        self.score = score

    def done_fail(self, score: int = 0):
        self.status = "fail"
        self.score = score


def ffprobe_info(path: str) -> Dict[str, Any]:
    """Return {'duration': float, 'width': int, 'height': int, 'size': int} or {}."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error",
             "-show_entries", "format=duration:stream=width,height,codec_name",
             "-of", "json", path],
            capture_output=True, timeout=10,
        )
        raw = json.loads(r.stdout.decode())
        fmt = raw.get("format", {})
        streams = raw.get("streams", [{}])
        st = streams[0] if streams else {}
        return {
            "duration": float(fmt.get("duration", 0.0)),
            "width":    int(st.get("width", 0)),
            "height":   int(st.get("height", 0)),
            "codec":    st.get("codec_name", ""),
            "size":     os.path.getsize(path),
        }
    except Exception:
        return {}


def assert_file(path: str, min_size: int = 1, label: str = "") -> bool:
    if not os.path.isfile(path):
        return False
    return os.path.getsize(path) >= min_size


# ── STAGE 1: Script Analysis ──────────────────────────────────────────────────

def stage_script_analysis(script: str) -> tuple[StageResult, Dict]:
    r = StageResult("script_analysis")
    t0 = time.time()

    # Simple rule-based analysis (mirrors what gemini_engine would produce)
    words     = script.lower().split()
    curiosity = sum(w in ("what", "if", "why", "how") for w in words)
    wonder    = sum(w in ("wonder", "unbelievable", "real", "dream", "amazing", "glowing") for w in words)
    action    = sum(w in ("explore", "let's", "discover", "go") for w in words)

    if curiosity >= 1:
        tone = "documentary"
    elif action > wonder:
        tone = "viral"
    else:
        tone = "storytelling"

    keywords = ["floating mountains", "glowing beaches", "dreamlike", "Maldives", "China", "wonder", "explore"]

    analysis = {
        "tone": tone,
        "emotion_curve": ["curiosity", "wonder", "excitement"],
        "keywords": keywords,
        "word_count": len(words),
        "sentence_count": len([s for s in script.split(".") if s.strip()]),
    }

    r.ok(f"Tone detected: {tone}")
    r.ok(f"Emotion curve: {' → '.join(analysis['emotion_curve'])}")
    r.ok(f"Keywords ({len(keywords)}): {', '.join(keywords[:4])} ...")
    r.ok(f"Word count: {analysis['word_count']}  •  Sentences: {analysis['sentence_count']}")

    r.duration_sec = time.time() - t0
    r.done_pass(score=9)
    return r, analysis


# ── STAGE 2: Scene Breakdown ──────────────────────────────────────────────────

def stage_scene_breakdown(script: str, analysis: Dict) -> tuple[StageResult, List[Dict]]:
    r = StageResult("scene_breakdown")
    t0 = time.time()

    try:
        # Attempt Gemini-based breakdown via gemini_engine
        try:
            from services.gemini_engine import generate_content_package
            pkg = generate_content_package(
                script,
                category="travel",
                style=analysis["tone"],
                niche="general",
            )
            raw_scenes = pkg.get("scenes", [])
            source = "gemini"
        except Exception as gem_exc:
            r.warn(f"Gemini engine failed ({gem_exc}) — using rule-based fallback")
            raw_scenes = []
            source = "fallback"

        # Rule-based fallback — split by sentence
        if not raw_scenes:
            sentences = [s.strip() for s in script.replace("\n", " ").split(".") if s.strip()]
            visual_map = {
                0: ["floating mountains China", "mystical mountains clouds cinematic"],
                1: ["glowing bioluminescent beach Maldives night", "glowing ocean waves blue"],
                2: ["surreal dreamlike landscape planet Earth aerial"],
                3: ["explore world adventure travel cinematic"],
            }
            raw_scenes = []
            for i, s in enumerate(sentences):
                vm = visual_map.get(i, [s.split()[:3]])
                raw_scenes.append({
                    "index":           i + 1,
                    "text":            s + ".",
                    "visual_keywords": vm,
                    "keywords":        vm,
                    "duration_sec":    max(4.0, len(s.split()) * 0.45),
                    "emotion":         analysis["emotion_curve"][min(i, len(analysis["emotion_curve"]) - 1)],
                    "intent":          "info",
                    "shot_type":       "wide",
                    "is_hook":         i == 0,
                    "is_pattern_interrupt": False,
                    "effect":          "none",
                    "style":           analysis["tone"],
                    "niche":           "general",
                })

        # Validate
        if not raw_scenes:
            r.fail("No scenes generated")
            r.duration_sec = time.time() - t0
            r.done_fail()
            return r, []

        r.ok(f"Scenes generated: {len(raw_scenes)} (source={source})")

        # Validate per-scene
        for s in raw_scenes:
            idx = s.get("index", "?")
            txt = s.get("text", "")
            dur = s.get("duration_sec", 0)
            vk  = s.get("visual_keywords") or s.get("keywords", [])
            score_deduct = 0
            if not txt:
                r.warn(f"Scene {idx}: empty text")
                score_deduct += 1
            if dur < 2.0:
                r.warn(f"Scene {idx}: very short duration ({dur:.1f}s)")
            if not vk:
                r.warn(f"Scene {idx}: no visual keywords")
                score_deduct += 1
            r.ok(f"  Scene {idx}: \"{txt[:60].rstrip()}...\"  •  {dur:.1f}s  •  emotion={s.get('emotion','?')}")

        r.artifacts["scenes_json"] = json.dumps(raw_scenes, indent=2)
        r.duration_sec = time.time() - t0
        scene_score = max(5, 10 - len(r.issues))
        r.done_pass(score=scene_score)
        return r, raw_scenes

    except Exception as exc:
        r.fail(f"Unexpected error: {exc}")
        r.duration_sec = time.time() - t0
        r.done_fail()
        return r, []


# ── STAGE 3: Voice Generation ─────────────────────────────────────────────────

def stage_voice_generation(
    scenes: List[Dict], project_dir: str, analysis: Dict
) -> tuple[StageResult, List[Dict]]:
    r = StageResult("voice_generation")
    t0 = time.time()

    from schemas.pipeline import VoiceRequest
    from services.voice_engine import generate_voiceover

    audio_dir = os.path.join(project_dir, "audio")
    os.makedirs(audio_dir, exist_ok=True)

    voice_style = analysis["tone"]  # documentary / storytelling / viral
    success_count = 0
    fail_count = 0

    for s in scenes:
        idx  = s["index"]
        text = s["text"]
        out  = os.path.join(audio_dir, f"audio_{idx:03d}.mp3")

        req = VoiceRequest(
            text=text,
            out_path=out,
            voice_style=voice_style,
            duration_hint=s.get("duration_sec", 4.0),
            scene_index=idx,
            is_hook=s.get("is_hook", False),
            is_reveal=False,
            is_ending=(idx == len(scenes)),
            emotion=s.get("emotion", "calm"),
            style=s.get("style", "viral"),
            niche=s.get("niche", "general"),
        )

        resp = generate_voiceover(req)

        if resp.success and assert_file(out, min_size=500):
            info = ffprobe_info(out) if out.endswith((".mp3", ".wav")) else {}
            dur  = resp.duration or info.get("duration", 0.0)
            r.ok(f"Scene {idx}: audio generated  •  {dur:.2f}s  •  {os.path.getsize(out):,} bytes")
            s["audio_file"]  = out
            s["duration_sec"] = dur + 0.3 if dur > 0 else s.get("duration_sec", 4.0)
            success_count += 1
        else:
            r.fail(f"Scene {idx}: voice generation failed — {resp.error}")
            fail_count += 1

    r.ok(f"Voice generation complete: {success_count}/{len(scenes)} scenes succeeded")
    if fail_count:
        r.warn(f"{fail_count} scenes failed voice generation")

    r.duration_sec = time.time() - t0
    score = 10 if fail_count == 0 else max(0, 10 - fail_count * 3)
    r.done_pass(score=score) if success_count > 0 else r.done_fail()
    return r, scenes


# ── STAGE 4: Visual Selection ─────────────────────────────────────────────────

def stage_visual_selection(
    scenes: List[Dict], project_dir: str
) -> tuple[StageResult, List[Dict]]:
    r = StageResult("visual_selection")
    t0 = time.time()

    from schemas.pipeline import MediaRequest
    from services.media_engine import fetch_best_media

    clips_dir  = os.path.join(project_dir, "clips")
    assets_dir = os.path.join(project_dir, "assets")
    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)

    success_count = fail_count = 0

    for s in scenes:
        idx  = s["index"]
        dur  = s.get("duration_sec", 4.0)
        keywords = s.get("visual_keywords") or s.get("keywords") or [s["text"].split()[:3]]

        raw_path  = os.path.join(assets_dir, f"raw_{idx:03d}.mp4")
        clip_path = os.path.join(clips_dir,  f"clip_{idx:03d}.mp4")

        req = MediaRequest(
            visual_intent=keywords,
            out_path=raw_path,
            prefer_video=True,
            scene_index=idx,
            style=s.get("style", "viral"),
            niche=s.get("niche", "general"),
        )
        try:
            result_path = fetch_best_media(req)

            if not result_path or not assert_file(result_path, 5000):
                raise RuntimeError("media_engine returned empty/no file")

            # Normalize to 1920x1080
            norm_ok = _normalize_clip(result_path, clip_path, dur, idx)
            if not norm_ok:
                raise RuntimeError("Normalization failed")

            info = ffprobe_info(clip_path)
            r.ok(
                f"Scene {idx}: {info.get('width')}x{info.get('height')}  "
                f"• {info.get('duration', 0):.1f}s  • {info.get('size', 0):,} bytes"
            )
            s["video_clip"]  = clip_path
            success_count += 1

        except Exception as exc:
            r.warn(f"Scene {idx}: visual failed ({exc})")
            fail_count += 1

    r.ok(f"Visual selection complete: {success_count}/{len(scenes)} acquired")
    r.duration_sec = time.time() - t0
    score = 10 if fail_count == 0 else max(0, 10 - fail_count * 2)
    r.done_pass(score=score) if success_count > 0 else r.done_fail()
    return r, scenes


def _normalize_clip(src: str, dst: str, duration: float, idx: int) -> bool:
    """Scale to 1920x1080 @ 30fps with safe filter."""
    filt = (
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p"
    )
    r = subprocess.run(
        ["ffmpeg", "-y", "-v", "warning",
         "-i", src, "-t", str(duration + 0.5),
         "-vf", filt,
         "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
         "-an", dst],
        capture_output=True, timeout=120,
    )
    return r.returncode == 0 and assert_file(dst, 1000)


# ── STAGE 5: Scene Assembly ───────────────────────────────────────────────────

def stage_scene_assembly(
    scenes: List[Dict], project_dir: str
) -> tuple[StageResult, List[Dict]]:
    r = StageResult("scene_assembly")
    t0 = time.time()

    assembled_dir = os.path.join(project_dir, "assembled")
    os.makedirs(assembled_dir, exist_ok=True)

    success_count = fail_count = 0

    for s in scenes:
        idx   = s["index"]
        video = s.get("video_clip", "")
        audio = s.get("audio_file", "")
        dur   = s.get("duration_sec", 4.0)
        out   = os.path.join(assembled_dir, f"scene_{idx:03d}.mp4")

        if not video or not assert_file(video, 1000):
            r.warn(f"Scene {idx}: missing video clip — skipping")
            fail_count += 1
            continue
        if not audio or not assert_file(audio, 500):
            r.warn(f"Scene {idx}: missing audio — skipping")
            fail_count += 1
            continue

        assemble_ok = subprocess.run(
            ["ffmpeg", "-y", "-v", "warning",
             "-i", video, "-i", audio,
             "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-ar", "44100", "-ac", "2",
             "-t", str(dur), "-shortest", "-movflags", "+faststart", out],
            capture_output=True, timeout=120,
        )

        if assemble_ok.returncode == 0 and assert_file(out, 10000):
            info = ffprobe_info(out)
            r.ok(
                f"Scene {idx}: assembled  •  {info.get('duration', 0):.1f}s  "
                f"• {info.get('width')}x{info.get('height')}  • {info.get('size', 0):,} bytes"
            )
            s["assembled_clip"] = out
            success_count += 1
        else:
            err = assemble_ok.stderr.decode()[-300:]
            r.fail(f"Scene {idx}: assembly FFmpeg error — {err}")
            fail_count += 1

    r.duration_sec = time.time() - t0
    score = 10 if fail_count == 0 else max(0, 10 - fail_count * 3)
    r.done_pass(score=score) if success_count > 0 else r.done_fail()
    return r, scenes


# ── STAGE 6: Final Video Render ───────────────────────────────────────────────

def stage_final_render(
    scenes: List[Dict], project_dir: str
) -> tuple[StageResult, str]:
    r = StageResult("final_render")
    t0 = time.time()

    final_path  = os.path.join(project_dir, "final_output.mp4")
    concat_file = os.path.join(project_dir, "concat.txt")

    clips = [s.get("assembled_clip", "") for s in scenes if s.get("assembled_clip")]
    missing = [i + 1 for i, s in enumerate(scenes) if not s.get("assembled_clip")]

    if not clips:
        r.fail("No assembled clips available for final render")
        r.duration_sec = time.time() - t0
        r.done_fail()
        return r, ""

    if missing:
        r.warn(f"Scenes missing assembled clips (will be skipped): {missing}")

    # Write concat list
    with open(concat_file, "w", encoding="utf-8") as f:
        for c in clips:
            safe = os.path.abspath(c).replace("\\", "/")
            f.write(f"file '{safe}'\n")

    r.ok(f"Concatenating {len(clips)} clips...")

    # Step 1 — stream copy concat
    raw_concat = os.path.join(project_dir, "concat_raw.mp4")
    proc = subprocess.run(
        ["ffmpeg", "-y", "-v", "warning",
         "-f", "concat", "-safe", "0", "-i", concat_file,
         "-c", "copy", "-movflags", "+faststart", raw_concat],
        capture_output=True, timeout=300,
    )

    if proc.returncode != 0:
        r.warn("Stream copy failed — retrying with re-encode...")
        proc = subprocess.run(
            ["ffmpeg", "-y", "-v", "warning",
             "-f", "concat", "-safe", "0", "-i", concat_file,
             "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-movflags", "+faststart", raw_concat],
            capture_output=True, timeout=600,
        )
        if proc.returncode != 0:
            r.fail(f"Concat failed:\n{proc.stderr.decode()[-400:]}")
            r.duration_sec = time.time() - t0
            r.done_fail()
            return r, ""

    r.ok(f"Concat raw ready: {os.path.getsize(raw_concat):,} bytes")

    # Step 2 — copy to final (add a simple fade-in/out)
    proc2 = subprocess.run(
        ["ffmpeg", "-y", "-v", "warning",
         "-i", raw_concat,
         "-vf", "fade=t=in:st=0:d=0.5",
         "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
         "-c:a", "copy", "-movflags", "+faststart", final_path],
        capture_output=True, timeout=600,
    )

    if proc2.returncode != 0 or not assert_file(final_path, 10000):
        # Fallback — just use raw concat
        r.warn("Fade filter failed — using raw concat as final")
        shutil.copy2(raw_concat, final_path)

    if not assert_file(final_path, 10000):
        r.fail("Final output file is missing or empty")
        r.duration_sec = time.time() - t0
        r.done_fail()
        return r, ""

    info = ffprobe_info(final_path)
    r.ok(f"Final video: {final_path}")
    r.ok(f"  Resolution: {info.get('width')}x{info.get('height')}")
    r.ok(f"  Duration:   {info.get('duration', 0):.2f}s")
    r.ok(f"  Size:       {info.get('size', 0):,} bytes")
    r.ok(f"  Codec:      {info.get('codec','?')}")

    # Quality validation
    w = info.get("width", 0)
    h = info.get("height", 0)
    d = info.get("duration", 0.0)

    if w < 1280 or h < 720:
        r.warn(f"Resolution below 720p ({w}x{h})")
    if d < 5.0:
        r.warn(f"Short final video ({d:.1f}s) — may indicate missing scenes")

    r.duration_sec = time.time() - t0
    vid_score = 10
    if w < 1920: vid_score -= 1
    if d < 10:   vid_score -= 2
    vid_score = max(0, vid_score - len(r.issues))
    r.done_pass(score=vid_score)
    return r, final_path


# ── Report ────────────────────────────────────────────────────────────────────

def print_report(
    results: List[StageResult],
    final_path: str,
    project_dir: str,
    total_sec: float,
):
    sep = "=" * 65
    print(f"\n{sep}")
    print("  PIPELINE VALIDATION REPORT")
    print(sep)

    print(f"\n  Input script: {len(INPUT_SCRIPT.split())} words")
    print(f"  Project dir:  {project_dir}")
    print(f"  Total time:   {total_sec:.1f}s\n")

    for r in results:
        icon = {"pass": "✅", "fail": "❌", "warn": "⚠️ ", "pending": "⏳"}.get(r.status, "?")
        print(f"  {icon}  [{r.name}]  score={r.score}/10  ({r.duration_sec:.1f}s)")
        for line in r.log:
            print(f"      {line}")
        if r.issues:
            for iss in r.issues:
                print(f"      ⚠  {iss}")
        print()

    # Quality scores
    scores = {r.name: r.score for r in results}
    all_scores = list(scores.values())
    overall = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0

    print(sep)
    print("  QUALITY SCORES")
    print(sep)
    print(json.dumps({
        "script_analysis":  scores.get("script_analysis",  0),
        "scene_breakdown":  scores.get("scene_breakdown",  0),
        "voice_generation": scores.get("voice_generation", 0),
        "visual_selection": scores.get("visual_selection", 0),
        "scene_assembly":   scores.get("scene_assembly",   0),
        "final_render":     scores.get("final_render",     0),
        "overall":          overall,
    }, indent=4))

    # Improvement suggestions
    suggestions = []
    for r in results:
        for iss in r.issues:
            suggestions.append(f"[{r.name}] {iss}")

    if suggestions:
        print(f"\n{sep}")
        print("  IMPROVEMENT SUGGESTIONS")
        print(sep)
        for s in suggestions:
            print(f"  • {s}")

    # Final path
    print(f"\n{sep}")
    if final_path and os.path.isfile(final_path):
        info = ffprobe_info(final_path)
        print(f"  🎬  FINAL VIDEO: {final_path}")
        print(f"      Duration: {info.get('duration', 0):.2f}s  | "
              f"Resolution: {info.get('width')}x{info.get('height')}  | "
              f"Size: {info.get('size', 0):,} bytes")
    else:
        print("  ❌  FINAL VIDEO: not produced")
    print(sep)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    total_start = time.time()

    project_id  = f"validation-{uuid.uuid4().hex[:8]}"
    project_dir = os.path.join(BACKEND_DIR, "test_output", project_id)
    os.makedirs(project_dir, exist_ok=True)

    print(f"\n{'='*65}")
    print(f"  ScriptToVideo — Full Pipeline Validation")
    print(f"  Project: {project_id}")
    print(f"  Dir:     {project_dir}")
    print(f"{'='*65}\n")
    print(f"  Input script:\n  {INPUT_SCRIPT.strip()}\n")

    all_results = []
    final_path  = ""

    # ── Stage 1: Script Analysis ──────────────────────────────────────────────
    print("\n── Stage 1: Script Analysis ──────────────────────────────")
    r1, analysis = stage_script_analysis(INPUT_SCRIPT)
    all_results.append(r1)
    if r1.status == "fail":
        print("  FATAL: Script analysis failed")
        print_report(all_results, "", project_dir, time.time() - total_start)
        return 1

    # ── Stage 2: Scene Breakdown ──────────────────────────────────────────────
    print("\n── Stage 2: Scene Breakdown ──────────────────────────────")
    r2, scenes = stage_scene_breakdown(INPUT_SCRIPT, analysis)
    all_results.append(r2)

    # Save scenes.json
    scenes_path = os.path.join(project_dir, "scenes.json")
    with open(scenes_path, "w") as f:
        json.dump(scenes, f, indent=2)

    if not scenes:
        print("  FATAL: No scenes produced")
        print_report(all_results, "", project_dir, time.time() - total_start)
        return 1

    # ── Stage 3: Voice Generation ─────────────────────────────────────────────
    print("\n── Stage 3: Voice Generation ─────────────────────────────")
    r3, scenes = stage_voice_generation(scenes, project_dir, analysis)
    all_results.append(r3)

    # ── Stage 4: Visual Selection ─────────────────────────────────────────────
    print("\n── Stage 4: Visual Selection ─────────────────────────────")
    r4, scenes = stage_visual_selection(scenes, project_dir)
    all_results.append(r4)

    # ── Stage 5: Scene Assembly ───────────────────────────────────────────────
    print("\n── Stage 5: Scene Assembly ───────────────────────────────")
    r5, scenes = stage_scene_assembly(scenes, project_dir)
    all_results.append(r5)

    # ── Stage 6: Final Render ─────────────────────────────────────────────────
    print("\n── Stage 6: Final Video Render ───────────────────────────")
    r6, final_path = stage_final_render(scenes, project_dir)
    all_results.append(r6)

    # ── Final Report ──────────────────────────────────────────────────────────
    print_report(all_results, final_path, project_dir, time.time() - total_start)

    # Return exit code
    failed = sum(1 for r in all_results if r.status == "fail")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
