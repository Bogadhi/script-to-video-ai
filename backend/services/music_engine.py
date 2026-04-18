import os
import random

print("🔥 MUSIC ENGINE LOADED")


# -----------------------------------
# BASE PATH DETECTION (CRITICAL FIX)
# -----------------------------------

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MUSIC_ROOT = os.path.join(BASE_DIR, "music")


# -----------------------------------
# CATEGORY → MUSIC STYLE MAP
# -----------------------------------

STYLE_MAP = {
    "travel": "cinematic",
    "facts": "documentary",
    "history": "documentary",
    "finance": "inspirational",
    "technology": "inspirational",
    "motivation": "inspirational",
    "mystery": "suspense",
    "horror": "suspense"
}


# -----------------------------------
# DETECT STYLE FROM SCENES
# -----------------------------------

def _detect_style(scenes):
    try:
        # simple keyword-based detection
        text = " ".join([s.get("narration", "") for s in scenes]).lower()

        if any(k in text for k in ["dark", "mystery", "unknown", "secret"]):
            return "suspense"

        if any(k in text for k in ["success", "money", "rich", "growth"]):
            return "inspirational"

        if any(k in text for k in ["history", "ancient", "past"]):
            return "documentary"

        return "cinematic"

    except:
        return "cinematic"


# -----------------------------------
# GET MUSIC FILES
# -----------------------------------

def _get_music_files(folder):
    if not os.path.exists(folder):
        return []

    return [
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.lower().endswith((".mp3", ".wav"))
    ]


# -----------------------------------
# MAIN FUNCTION
# -----------------------------------

def get_music_for_project(scenes):
    print("[Music Engine] 🎯 Selecting music...")

    # -------------------------
    # STYLE DETECTION
    # -------------------------
    style = _detect_style(scenes)

    print(f"[Music Engine] 🎯 Auto-detected style: {style}")

    style_folder = os.path.join(MUSIC_ROOT, style)

    # -------------------------
    # PRIMARY SEARCH
    # -------------------------
    files = _get_music_files(style_folder)

    if files:
        selected = random.choice(files)
        print(f"[Music Engine] ✅ Selected: {os.path.basename(selected)}")
        return selected

    print(f"[Music Engine] ⚠️ No files in '{style}' folder")

    # -------------------------
    # FALLBACK: SEARCH ALL FOLDERS
    # -------------------------
    all_files = []

    for sub in os.listdir(MUSIC_ROOT):
        sub_path = os.path.join(MUSIC_ROOT, sub)
        if os.path.isdir(sub_path):
            all_files.extend(_get_music_files(sub_path))

    if all_files:
        selected = random.choice(all_files)
        print(f"[Music Engine] 🔁 Fallback selected: {os.path.basename(selected)}")
        return selected

    print("[Music Engine] ❌ No music files found anywhere")

    return None