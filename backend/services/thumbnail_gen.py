import os
import subprocess


def generate_thumbnail(video_path: str, text: str, output_path: str):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # try multiple timestamps (ULTRA SAFE)
    timestamps = ["00:00:01", "00:00:00.5", "00:00:00"]

    for ts in timestamps:
        cmd = [
            "ffmpeg", "-y",
            "-ss", ts,
            "-i", video_path,
            "-vframes", "1",
            "-vf", "scale=1280:720",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if os.path.exists(output_path):
            print(f"[Thumbnail] ✅ Created using timestamp {ts}")
            return output_path

    # 🔥 FINAL FALLBACK (always works)
    print("[Thumbnail] ⚠ Using fallback blank thumbnail")

    fallback_cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", "color=c=black:s=1280x720",
        "-vframes", "1",
        output_path
    ]

    subprocess.run(fallback_cmd, capture_output=True, text=True)

    if not os.path.exists(output_path):
        raise ValueError("Thumbnail generation failed completely")

    print(f"[Thumbnail] ✅ Fallback created")
    return output_path