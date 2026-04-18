import time
import requests
import json
import sys

API_BASE = "http://localhost:8000"

print("Starting custom category pipeline test...")
r = requests.post(f"{API_BASE}/api/scripts/upload", data={
    "script_text": "Space is massive. There are billions of galaxies. Each galaxy has billions of stars. We are just a small speck in the universe.",
    "video_category": "space",
    "scene_count": "4",
    "scene_duration": "5",
    "music_style": "futuristic",
    "visual_style": "cinematic",
    "thumbnail_style": "bold"
})

if r.status_code != 200:
    print(f"Failed to upload script: {r.text}")
    sys.exit(1)

project_id = r.json()["project_id"]
print(f"Project created: {project_id}")

for idx in range(60):
    time.sleep(3)
    status_req = requests.get(f"{API_BASE}/api/pipeline/{project_id}/status")
    data = status_req.json()
    status = data.get("overall_status", "unknown")
    print(f"[{idx*3}s] Status: {status}")
    if status in ("complete", "error"):
        print(f"Final status: {status}")
        print(json.dumps(data, indent=2))
        sys.exit(0 if status == "complete" else 1)

print("Timeout waiting for pipeline to complete.")
sys.exit(1)
