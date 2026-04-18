import os
import subprocess
from typing import List, Set

from pipeline.video.clip_planner import plan_clips
from pipeline.video.clip_selector import select_best_clips
from pipeline.video.shot_planner import generate_shot_sequence
from pipeline.video.scene_assembler import trim_clip, assemble_scene_from_clips

from services.media_engine import search_multi_media, download_and_cache_media

print("🔥 AI-ENHANCED VIDEO BUILDER LOADED")


# =========================
# AUDIO DURATION
# =========================
def _get_audio_duration(audio_path: str, fallback=6.0):
    try:
        result = subprocess.run([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path
        ], capture_output=True, text=True)

        return float(result.stdout.strip())
    except:
        return fallback


# =========================
# CLEAN SEARCH QUERY (🔥 FIX)
# =========================
def _clean_query(text: str) -> str:
    if not text:
        return "cinematic nature"

    # Take first sentence only
    text = text.split(".")[0]

    # Limit length
    text = text[:80]

    # Add cinematic boost keywords
    return f"{text} cinematic nature travel"


# =========================
# BUILD SCENE VIDEO
# =========================
def build_scene_video(scene: dict, project_dir: str, used_clips: Set[str] = None) -> str:
    if used_clips is None:
        used_clips = set()

    n = scene["scene_number"]
    audio = scene["audio_path"]
    prompt = scene.get("visual_prompt", "")
    keywords = scene.get("keywords", [])
    queries = scene.get("search_queries") or [prompt]

    # 🎬 REFINED SCENE DURATION (Phase 27)
    # Capping at 4.0s to force high-velocity cuts
    duration = min(_get_audio_duration(audio) + 0.3, 4.0)
    print(f"[Scene {n}] cinematic duration: {duration:.2f}s")

    # =========================
    # CLIP PLAN
    # =========================
    plan = plan_clips(duration)

    clip_count = plan.get("clip_count", 2)
    clip_durations = plan.get("clip_durations", [duration / clip_count] * clip_count)

    # 🔥 FIX: no more crash
    crossfade = plan.get("crossfade_duration", 0.5)

    shot_seq = generate_shot_sequence(clip_count, n)

    # =========================
    # MULTI-QUERY SEARCH (🔥 IMPROVED)
    # =========================
    candidates = []

    for q in queries:
        clean_q = _clean_query(q)
        print(f"[Video Builder] Searching: {clean_q}")

        results = search_multi_media(clean_q, count=5)
        candidates.extend(results or [])

    # remove duplicates
    seen_urls = set()
    unique_candidates = []

    for c in candidates:
        url = c.get("url")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_candidates.append(c)

    print(f"[Video Builder] Total candidates: {len(unique_candidates)}")

    # =========================
    # CLIP SELECTION
    # =========================
    selected = select_best_clips(
        clips=unique_candidates,
        scene_text=prompt,
        top_k=clip_count
    )

    # =========================
    # FALLBACKS (🔥 IMPROVED)
    # =========================
    if not selected:
        print("[Video Builder] ⚠ fallback search")

        fallback_query = _clean_query(prompt) or "nature cinematic"
        fallback = search_multi_media(fallback_query, count=5)

        if fallback:
            selected = fallback[:clip_count]

    if not selected:
        print("[Video Builder] ❌ using placeholder")

        fallback_url = "https://picsum.photos/1920/1080"
        fallback_path = download_and_cache_media(fallback_url, "image")

        selected = [{"url": fallback_path, "type": "image"}]
        clip_durations = [duration]

    # =========================
    # RHYTHMIC STATE CONTROL (Phase 28)
    # =========================
    spike_limit = max(1, len(selected) // 3)
    ramp_limit = 2
    blur_limit = max(1, int(len(selected) * 0.3))

    spike_count = 0
    ramp_count = 0
    blur_count = 0

    intent = scene.get("intent", "info")
    is_static = scene.get("is_static", False)
    # Builder knows if scene has narration audio
    has_narration = os.path.exists(audio)
    
    # Alternating contrast offset (Phase 28)
    contrast_offset = 1.15 if n % 2 == 0 else 1.0

    # =========================
    # PROCESS CLIPS
    # =========================
    temp_dir = os.path.join(project_dir, "temp", f"s{n}")
    os.makedirs(temp_dir, exist_ok=True)

    clips = []

    for i, c in enumerate(selected):
        try:
            local = (
                download_and_cache_media(c["url"], c["type"])
                if c["url"].startswith("http")
                else c["url"]
            )

            if not local or not os.path.exists(local):
                continue

            out = os.path.join(temp_dir, f"{i}.mp4")
            trim_duration = clip_durations[min(i, len(clip_durations) - 1)]

            # 🛠 CALCULATE SEMANTIC FLAGS
            # Phase 30: Cinematic Trigger Strategy
            # Trigger Spike at Scene 1 (Hook), 3/4 (Mid), and 6 (Reveal)
            allow_spike = (n == 1 or n in [3, 4, 6])
            if allow_spike:
                spike_count += 1

            allow_speed_ramp = False
            if not has_narration and ramp_count < ramp_limit:
                allow_speed_ramp = True
                ramp_count += 1

            allow_blur = False
            if is_static and blur_count < blur_limit:
                allow_blur = True
                blur_count += 1

            # 🎬 TRIM WITH SEMANTIC ANALYTICS
            trim_clip(
                local, 
                trim_duration, 
                out,
                intent=intent,
                is_static=is_static,
                has_voice=has_narration,
                contrast_offset=contrast_offset,
                allow_spike=allow_spike,
                allow_speed_ramp=allow_speed_ramp,
                allow_blur=allow_blur
            )
            clips.append(out)
            used_clips.add(c["url"])

        except Exception as e:
            print("[Video Builder] Clip error:", e)

    if not clips:
        raise RuntimeError("No valid clips")

    # =========================
    # ASSEMBLE SCENE
    # =========================
    output = os.path.join(project_dir, "scenes", f"scene_{n}.mp4")
    os.makedirs(os.path.dirname(output), exist_ok=True)

    assemble_scene_from_clips(clips, output, crossfade)

    return output


# =========================
# FINAL VIDEO ASSEMBLY
# =========================
def assemble_final_video(scene_paths: List[str], music_path: str, output: str):
    import shutil

    os.makedirs(os.path.dirname(output), exist_ok=True)

    scene_paths = [os.path.abspath(p) for p in scene_paths]

    concat_file = output.replace(".mp4", ".txt")

    with open(concat_file, "w") as f:
        for p in scene_paths:
            f.write(f"file '{p}'\n")

    temp_output = output.replace(".mp4", "_temp.mp4")

    print("[Video Builder] 🎬 Concatenating scenes...")

    result = subprocess.run([
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_file,
        "-c:v", "libx264",
        "-c:a", "aac",
        temp_output
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print("❌ FFmpeg concat error:")
        print(result.stderr)
        raise RuntimeError("FFmpeg concat failed")

    # =========================
    # ADD MUSIC
    # =========================
    if music_path and os.path.exists(music_path):
        print("[Video Builder] 🎵 Adding background music...")

        music_result = subprocess.run([
            "ffmpeg", "-y",
            "-i", temp_output,
            "-stream_loop", "-1", "-i", music_path,
            "-shortest",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            output
        ], capture_output=True, text=True)

        if music_result.returncode != 0:
            print("⚠ Music merge failed, using video without music")
            print(music_result.stderr)
            shutil.copy(temp_output, output)

    else:
        print("[Video Builder] ⚠ No music found, skipping...")
        shutil.copy(temp_output, output)

    # cleanup
    if os.path.exists(concat_file):
        os.remove(concat_file)

    print("✅ Final video ready:", output)
    return output