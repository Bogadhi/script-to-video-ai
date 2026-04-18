import time
import requests
import json
import sys

API_BASE = "http://localhost:8000"

print("Starting intelligent pipeline test...")
r = requests.post(f"{API_BASE}/api/scripts/upload", data={
    "script_text": "Did you know there is a beach where the ocean glows at night? Millions of plankton glow when disturbed. This magical phenomenon is called bioluminescence. Suddenly, a massive wave crashes illuminating the entire shore! Truly nature is beautiful.",
    "video_category": "travel",
    "scene_count": "5",
    "scene_duration": "0",  # Let dynamic pacing take over
    "visual_style": "cinematic"
})

if r.status_code != 200:
    print(f"Failed to upload script: {r.text}")
    sys.exit(1)

project_id = r.json()["project_id"]
print(f"Project created: {project_id}")

start_req = requests.post(f"{API_BASE}/api/pipeline/{project_id}/start")
if start_req.status_code != 200:
    print(f"Failed to start pipeline: {start_req.text}")
    sys.exit(1)
print("Pipeline started successfully.")

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
