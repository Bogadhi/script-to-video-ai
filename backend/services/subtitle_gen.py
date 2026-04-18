import os
import json


def _format_ass_time(seconds: float) -> str:
    """Format time for .ass files: H:MM:SS.cs (centiseconds)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds - int(seconds)) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _format_srt_time(seconds: float) -> str:
    total_ms = max(0, int(seconds * 1000))
    hours = total_ms // 3_600_000
    minutes = (total_ms % 3_600_000) // 60_000
    secs = (total_ms % 60_000) // 1000
    ms = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def _is_highlight_word(word: str) -> bool:
    clean = word.lower().strip(".,!?\"'")
    return len(clean) > 4


def generate_subtitles(narration_audio_path: str, output_dir: str):
    """
    Generate both ASS and SRT subtitles from the canonical scenes manifest.
    """
    os.makedirs(output_dir, exist_ok=True)
    project_dir = output_dir
    scenes_path = os.path.join(project_dir, "scenes", "scenes.json")

    scenes = []
    if os.path.exists(scenes_path):
      try:
          with open(scenes_path, "r", encoding="utf-8") as f:
              scenes = json.load(f)
      except Exception as e:
          print(f"[Subtitle] Failed to read scene file: {e}")

    if not scenes:
        print("[Subtitle] No scenes found, cannot generate subtitles")
        return {"ass_path": None, "srt_path": None}

    try:
        from pydub import AudioSegment
        has_pydub = True
    except ImportError:
        has_pydub = False

    ass_lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1920",
        "PlayResY: 1080",
        "WrapStyle: 1",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Arial,96,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,2,10,10,120,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    srt_lines = []
    current_time = 0.0
    subtitle_index = 1

    for i, scene in enumerate(scenes, start=1):
        scene_num = int(scene.get("scene_number", scene.get("index", i)))
        text = scene.get("narration", scene.get("text", "")).strip()
        if not text:
            continue

        audio_path = os.path.join(project_dir, "scenes", "audio", f"audio_{scene_num:03d}.mp3")
        duration = float(scene.get("duration", scene.get("duration_sec", 4.0)))

        if has_pydub:
            if os.path.exists(audio_path):
                audio = AudioSegment.from_mp3(audio_path)
                duration = len(audio) / 1000.0
            elif narration_audio_path and os.path.exists(narration_audio_path):
                total_audio = AudioSegment.from_mp3(narration_audio_path)
                duration = (len(total_audio) / 1000.0) / max(len(scenes), 1)

        scene_start = current_time
        scene_end = current_time + duration

        words = text.split()
        if not words:
            current_time = scene_end
            continue

        time_per_word = duration / len(words)
        for w_idx, _ in enumerate(words):
            word_start = scene_start + (w_idx * time_per_word)
            word_end = word_start + time_per_word

            rendered_line = ""
            for seq_idx, seq_word in enumerate(words):
                if seq_idx == w_idx:
                    rendered_line += f"{{\\bord3\\shad2\\c&H00CCFF&}}{seq_word}{{\\c&H00FFFFFF&}} "
                elif _is_highlight_word(seq_word):
                    rendered_line += f"{{\\bord3\\shad2\\c&H00E6E6E6&}}{seq_word}{{\\c&H00FFFFFF&}} "
                else:
                    rendered_line += f"{{\\bord3\\shad2}}{seq_word} "

            ass_lines.append(
                f"Dialogue: 0,{_format_ass_time(word_start)},{_format_ass_time(word_end)},Default,,0,0,0,,{rendered_line.strip()}"
            )

        srt_lines.extend([
            str(subtitle_index),
            f"{_format_srt_time(scene_start)} --> {_format_srt_time(scene_end)}",
            text,
            "",
        ])
        subtitle_index += 1
        current_time = scene_end

    ass_path = os.path.join(output_dir, "subtitles.ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ass_lines))

    srt_path = os.path.join(output_dir, "subtitles.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(srt_lines))

    print(f"[Subtitle] Saved subtitles at: {ass_path} and {srt_path}")
    return {"ass_path": ass_path, "srt_path": srt_path}


def burn_subtitles(video_path: str, srt_path: str, output_path: str) -> str:
    import subprocess

    if not srt_path or not os.path.exists(srt_path):
        print("[Subtitle] No subtitle file to burn")
        return video_path

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    escaped = srt_path.replace("\\", "/").replace(":", "\\:")

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", f"subtitles='{escaped}'",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "copy",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("[Subtitle] Burn failed:", result.stderr)
        return video_path

    print("[Subtitle] Burned into video")
    return output_path
