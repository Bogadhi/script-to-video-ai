import os
import sys

# Ensure services are in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.scene_analyzer import _generate_visual_prompt, _detect_topic_anchor

def test_p9_contextual_prompts():
    print("--- Testing Phase 9: Contextual Scene Prompts ---")
    
    script = "Have you ever seen the glowing beaches of Vaadhoo Island in the Maldives? Basically, it is magical. Millions of plankton glow when waves crash."
    
    topic_anchor = _detect_topic_anchor(script)
    print(f"\n[Detected Anchor] {topic_anchor}")
    
    # Test specific sentence
    sentence = "Millions of plankton glow when waves crash."
    print(f"\n[Test Narration] {sentence}")
    
    v_prompt = _generate_visual_prompt(topic_anchor, sentence)
    print(f"[Resulting Prompt] {v_prompt}")
    # Expected: "glowing beaches vaadhoo island maldives millions plankton" -> deduped/cleaned/limited

if __name__ == "__main__":
    test_p9_contextual_prompts()
