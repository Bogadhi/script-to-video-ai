import os
import sys
import json
import shutil
import time
import logging

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from workers.pipeline_worker import run_full_pipeline
from utils.status import read_status

# Configure logging to see what's happening
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

PROJECT_ID = "diagnostic_project"
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "projects")
PROJECT_DIR = os.path.join(BASE_DIR, PROJECT_ID)

def setup_project():
    if os.path.exists(PROJECT_DIR):
        print(f"Cleaning up existing project: {PROJECT_DIR}")
        shutil.rmtree(PROJECT_DIR)
    
    os.makedirs(PROJECT_DIR, exist_ok=True)
    
    script_text = "Did you know there's a beach where the ocean glows blue at night? It looks like the stars have fallen into the water. This magical bioluminescence is caused by tiny plankton that light up when the waves crash. Discover how nature creates this neon masterpiece."
    
    with open(os.path.join(PROJECT_DIR, "script.txt"), "w", encoding="utf-8") as f:
        f.write(script_text)
        
    config = {
        "user_id": "diagnostic_user",
        "style": "mystery",
        "niche": "nature",
        "voice_style": "documentary",
        "music_style": "cinematic",
        "language": "en"
    }
    
    with open(os.path.join(PROJECT_DIR, "config.json"), "w", encoding="utf-8") as f:
        json.dump(config, f)
    
    print(f"Project {PROJECT_ID} setup complete.")

def run_diagnostic():
    print(f"Starting pipeline for project {PROJECT_ID}...")
    start_time = time.time()
    
    try:
        # Call the task function directly
        run_full_pipeline(PROJECT_ID)
        
        duration = time.time() - start_time
        print(f"\n✅ PIPELINE COMPLETED in {duration:.2f}s")
        
        # Check final status
        status = read_status(PROJECT_ID)
        print(f"Final Status: {status.get('status')}")
        
    except Exception as e:
        print(f"\n❌ PIPELINE FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    setup_project()
    run_diagnostic()
