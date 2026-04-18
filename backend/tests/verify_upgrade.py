import os
import json
from services.scene_analyzer import analyze_script
from services.image_gen import _get_prompt_hash

def test_upgrade():
    print("--- Phase 1: Semantic Intelligence ---")
    script_text = "Did you know there is a place where the ocean glows at night on Vaadhoo Island in the Maldives? Visitor walk along the glowing shoreline. This magical phenomenon is truly nature at its best."
    
    # 1. Topic Anchor Detection
    anchor, scenes = analyze_script(script_text)
    print(f"Detected Anchor: {anchor}")
    # Target: "know ocean glows night vaadhoo island" or similar tokens
    
    # 2. Dynamic Scene Count
    # 32 words -> max(6, 32//30) = 6 scenes
    print(f"Scene Count (expected 6): {len(scenes)}")
    
    # 3. Visual Prompt Consistency
    print(f"Scene 1 Prompt: {scenes[0]['visual_prompt']}")
    print(f"Scene 2 Prompt: {scenes[1]['visual_prompt']}")
    # Should contain the anchor tokens
    
    print("\n--- Phase 2: Media Caching ---")
    prompt1 = scenes[0]['visual_prompt']
    hash1 = _get_prompt_hash(prompt1)
    prompt2 = "bioluminescent plankton glowing ocean night"
    hash2 = _get_prompt_hash(prompt2)
    
    print(f"Prompt 1 Hash: {hash1}")
    print(f"Prompt 2 Hash: {hash2}")
    
    # Check if directory exists
    cache_dir = os.path.join(os.path.dirname(__file__), "..", "media_cache")
    print(f"Cache Directory Exists: {os.path.exists(cache_dir)}")

if __name__ == "__main__":
    test_upgrade()
