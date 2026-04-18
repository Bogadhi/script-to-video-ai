import os
import subprocess
import random
from typing import List


# -----------------------------------
# TRIM CLIP (CINEMATIC + ULTRA STABLE)
# -----------------------------------

def trim_clip(
    input_path: str, 
    duration: float, 
    output_path: str,
    intent: str = "info",
    is_static: bool = False,
    has_voice: bool = True,
    contrast_offset: float = 1.0,
    allow_spike: bool = False,
    allow_speed_ramp: bool = False,
    allow_blur: bool = False
) -> str:
    """
    Controlled Visual Addiction Engine (Phase 28):
    - Semantic Attention Spikes (Hook/Reveal only)
    - Subtle Focus (Edge blur on static/close shots)
    - Audio-sync speed ramps (Silence only)
    - Dynamic Contrast Flow
    """

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    ext = os.path.splitext(input_path)[1].lower()
    is_video = ext in [".mp4", ".mov", ".avi", ".mkv", ".webm"]

    # ⚡ ATTENTION SPIKE (Phase 31: Director's Cut Impact)
    spike = ""
    zoom_punch = ""
    if allow_spike and intent in ["hook", "reveal", "surprise", "intensity"]:
        # Aggressive zoom punch: 1.25x -> 1.05x
        zoom_punch = f"zoompan=z='if(lt(T,0.4), 1.25-T*0.5, 1.05)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,"
        # Brightness flash (0.4s)
        spike = ",eq=brightness='if(lt(T,0.4), 0.25, 0.0)'"
        effect = ""
    else:
        # 🎬 DEFAULT MOTION ENGINE
        effects = [
            "zoompan=z='min(zoom+0.0005,1.05)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080",
            "zoompan=z='min(zoom+0.0005,1.05)':d=125:x='min(x+0.2,iw/zoom)':y='min(y+0.2,ih/zoom)':s=1920x1080",
            "zoompan=z='1.05':d=125:y='ih-ih/zoom-(t*0.5)':x='iw/2-iw/zoom/2':s=1920x1080"
        ]
        effect = random.choice(effects) + ","

    # 🌊 SPEED RAMP (Conditional - Silence only)
    speed_ramp = ""
    if allow_speed_ramp and not has_voice and is_video:
        # Slow start -> fast -> normal
        speed_ramp = "setpts='if(lt(T,0.5), 1.5*PTS, if(lt(T,1.2), 0.6*PTS, PTS))',"

    # 🎨 COLOR GRADING & FOCUS
    contrast = 1.15 * contrast_offset
    blur = ""
    if allow_blur and is_static:
        blur = ",boxblur=10:1:cr=0:cv=0,vignette=angle=0.5"
    else:
        blur = ",vignette=angle=0.4"

    COLOR_GRADE = f"eq=contrast={contrast:.2f}:brightness=0.02:saturation=1.08{spike}{blur},unsharp=5:5:0.8:5:5:0.8"

    COMMON_FILTER = (
        f"{speed_ramp}"
        f"{zoom_punch}"
        f"{effect}"
        f"{COLOR_GRADE},"
        "fps=30,"
        "scale=1920:1080:force_original_aspect_ratio=increase,"
        "crop=1920:1080,"
        "setsar=1,"
        "setpts=PTS-STARTPTS"
    )

    if is_video:
        cmd = [
            "ffmpeg", "-y",
            "-ss", "0",
            "-i", input_path,
            "-t", str(duration),
            "-vf", COMMON_FILTER,
            "-r", "30",
            "-vsync", "cfr",
            "-an",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "21", # Higher quality
            "-pix_fmt", "yuv420p",
            output_path
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", input_path,
            "-t", str(duration),
            "-vf", COMMON_FILTER,
            "-r", "30",
            "-vsync", "cfr",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            output_path
        ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"[Scene Assembler] Trim failed:\n{result.stderr}")

    return output_path


# -----------------------------------
# GET DURATION
# -----------------------------------

def _get_duration(path: str) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(res.stdout.strip())
    except:
        return 2.0


# -----------------------------------
# ASSEMBLE WITH XFADE (CINEMATIC)
# -----------------------------------

def assemble_scene_from_clips(
    clip_paths: List[str],
    output_path: str,
    crossfade_duration: float = 0.5
) -> str:

    if not clip_paths:
        raise ValueError("No clips provided.")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # ✅ single clip shortcut
    if len(clip_paths) == 1:
        import shutil
        shutil.copy2(clip_paths[0], output_path)
        return output_path

    print(f"[Scene Assembler] 🎬 Combining {len(clip_paths)} clips")

    # -------------------------
    # INPUTS
    # -------------------------
    input_args = []
    for p in clip_paths:
        input_args.extend(["-i", p])

    durations = [_get_duration(p) for p in clip_paths]

    # -------------------------
    # FILTER COMPLEX
    # -------------------------
    filter_parts = []

    current = "[0:v]"
    accumulated = 0.0

    for i in range(1, len(clip_paths)):
        accumulated += durations[i - 1] - crossfade_duration

        next_label = f"[v{i}]"

        part = (
            f"{current}[{i}:v]"
            f"xfade=transition=fadeblack:"
            f"duration={crossfade_duration}:"
            f"offset={accumulated},"
            f"format=yuv420p"
            f"{next_label}"
        )

        filter_parts.append(part)
        current = next_label

    filter_complex = ";".join(filter_parts)

    # replace last label with output
    filter_complex = filter_complex.replace(current, "[outv]")

    # -------------------------
    # RUN FFMPEG
    # -------------------------
    cmd = [
        "ffmpeg", "-y"
    ] + input_args + [
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    # -------------------------
    # FALLBACK (SUPER SAFE)
    # -------------------------
    if result.returncode != 0:
        print("⚠️ XFADE FAILED → using SAFE CONCAT")

        concat_file = output_path + ".txt"

        with open(concat_file, "w") as f:
            for p in clip_paths:
                f.write(f"file '{p.replace(chr(92), '/')}'\n")

        cmd_fallback = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path
        ]

        fallback = subprocess.run(cmd_fallback, capture_output=True, text=True)

        if fallback.returncode != 0:
            raise RuntimeError(
                f"[Scene Assembler] Fallback failed:\n{fallback.stderr}"
            )

        if os.path.exists(concat_file):
            os.remove(concat_file)

    # -------------------------
    # FINAL CHECK
    # -------------------------
    if not os.path.exists(output_path):
        raise RuntimeError("[Scene Assembler] Output video not created")

    print(f"[Scene Assembler] ✅ Scene ready: {output_path}")

    return output_path