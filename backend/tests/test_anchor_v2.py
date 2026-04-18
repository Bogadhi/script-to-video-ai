import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.scene_analyzer import _detect_topic_anchor

def test_anchor():
    print("--- Testing Topic Anchor Extraction ---")
    
    # User's example script
    script = "Have you ever seen an ocean that glows at night in the Maldives? Basically, it is magical. Imagine walking on the glowing beach."
    
    anchor = _detect_topic_anchor(script)
    print(f"Script: {script}")
    print(f"Resulting Anchor: '{anchor}'")
    
    # Expected to remove: ever, seen, basically, imagine
    # Meaningful words: ocean, glows, night, maldives, magical, glowing, beach
    
    # Target was: "bioluminescent ocean Maldives glowing beach"
    # Actually our extractor is simple token based, let's see what it gets now.
    
    print("\n--- Testing Visual Prompt Generation Logic ---")
    # Simulate first scene
    from services.scene_analyzer import analyze_script
    anchor, scenes = analyze_script(script)
    print(f"Final Topic Anchor: {anchor}")
    for s in scenes:
        print(f"Scene {s['scene_number']} Visual Prompt: {s['visual_prompt']}")

if __name__ == "__main__":
    test_anchor()
