import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.scene_analyzer import _detect_topic_anchor, _generate_visual_prompt

def test_v4_logic():
    print("--- Testing Pass 4.0 Semantic Upgrade ---")
    
    # User's example script
    script = "Have you ever seen the glowing beaches of Vaadhoo Island in the Maldives? Basically, it is magical. Imagine walking on the glowing beach."
    
    print(f"Script: {script}")
    
    # Test Anchor Extraction
    anchor = _detect_topic_anchor(script)
    print(f"Resulting Anchor: '{anchor}'")
    # Expected: "glowing beaches vaadhoo island maldives" or similar 3-5 tokens
    # Note: "ever", "seen", "basically", "magical", "imagine" should be filtered.
    
    # Test Visual Prompt Generation
    scene_keywords = ["magical", "dark", "waves", "plankton"]
    v_prompt = _generate_visual_prompt(anchor, scene_keywords)
    print(f"Scene keywords: {scene_keywords}")
    print(f"Resulting Visual Prompt: '{v_prompt}'")
    # Expected: anchor + waves + plankton (up to 6 tokens total)
    # "magical" and "dark" are weak adjectives or stopwords.

if __name__ == "__main__":
    test_v4_logic()
