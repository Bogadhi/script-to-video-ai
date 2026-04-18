import subprocess
import os


def merge_audio(video_path: str, audio_path: str, output_path: str) -> str:
    """
    Merge narration audio with final video.
    """

    if not os.path.exists(audio_path):
        print("[Audio Merge] No audio found, skipping...")
        return video_path

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("[Audio Merge] Failed:", result.stderr)
        return video_path

    print("[Audio Merge] ✅ Audio added")
    return output_path