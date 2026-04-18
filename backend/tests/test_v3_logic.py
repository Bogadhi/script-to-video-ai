import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.scene_analyzer import _detect_topic_anchor, _generate_visual_prompt, _normalize_prompt

def test_v3_logic():
    print("--- Testing Pass 2.0 Scene Intelligence ---")
    
    # 1. Normalization
    raw = "Bioluminescent Ocean, Maldives!!"
    norm = _normalize_prompt(raw)
    print(f"Normalize Test: '{raw}' -> '{norm}'")
    
    # 2. Anchor Deduplication
    script = "Have you ever seen the glowing ocean ocean ocean of Maldives? Basically, it is magical."
    # _extract_keywords already deduplicates, but let's see final result
    anchor = _detect_topic_anchor(script)
    print(f"Anchor Test: '{anchor}' (Should be unique tokens)")
    
    # 3. Visual Prompt Generation
    keywords = ["ocean", "glowing", "magical"]
    topic_anchor = "maldives bioluminescent ocean"
    v_prompt = _generate_visual_prompt(keywords, topic_anchor, "travel")
    print(f"Visual Prompt Test: '{v_prompt}'")

if __name__ == "__main__":
    test_v3_logic()
