import sys
import os
import json
import logging

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from services.gemini_engine import generate_content_package
from services.scene_engine import process_scenes
from services.quality_gate import validate_output, validate_hook_strength

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("verify_psychology")

def test_hook_validation():
    logger.info("--- Testing Hook Validation Loop ---")
    # We can't easily force Gemini to fail, but we can verify the scoring logic
    strong_hook = "You won't believe the secret hidden inside this bioluminescent beach!"
    weak_hook = "In this video we will look at a beach that glows at night."
    
    strong_metrics = validate_hook_strength(strong_hook)
    weak_metrics = validate_hook_strength(weak_hook)
    
    logger.info(f"Strong Hook Score: {strong_metrics['score']} (Matched: {strong_metrics['matched']})")
    logger.info(f"Weak Hook Score: {weak_metrics['score']} (Matched: {weak_metrics['matched']})")
    
    assert strong_metrics['score'] >= 2, "Strong hook should score high"
    assert weak_metrics['score'] < 2, "Weak hook should score low"
    logger.info("Hook Validation Logic: PASSED")

def test_style_propagation():
    logger.info("--- Testing Style/Niche Propagation ---")
    topic = "The hidden pyramids of Antarctica"
    styles = ["mystery", "facts"]
    
    for style in styles:
        logger.info(f"Testing Style: {style}")
        # Mocking generate_content_package call or similar
        # Since we use LLM, we'll just check if process_scenes handles the params
        raw_scenes = [{"text": "Sample scene", "keywords": ["ice", "pyramid"]}]
        processed = process_scenes(raw_scenes, style=style, niche="mystery")
        
        assert processed[0]["style"] == style
        assert processed[0]["niche"] == "mystery"
        logger.info(f"Style '{style}' propagated correctly.")

def test_rewatch_loop():
    logger.info("--- Testing Rewatch Loop Logic ---")
    raw_scenes = [
        {"text": "Hook: Why is it glowing?", "visual_intent": {"subject": "glowing beach"}},
        {"text": "Middle content"},
        {"text": "And that is why you should never... wait, do you see it?"}
    ]
    
    processed = process_scenes(raw_scenes)
    final_scene = processed[-1]
    
    logger.info(f"Final Scene Emotion: {final_scene['emotion']}")
    logger.info(f"Final Scene Visual Keywords: {final_scene['visual_keywords']}")
    
    try:
        assert final_scene["emotion"] == "curiosity", f"Expected curiosity, got {final_scene['emotion']}"
        assert any(x in final_scene["visual_keywords"] for x in ["glowing", "beach", "glow"]), f"Final keywords {final_scene['visual_keywords']} missing hook connection"
        logger.info("Rewatch Loop Logic: PASSED")
    except AssertionError as e:
        logger.error(f"Rewatch Loop Logic FAILED: {e}")
        raise e

if __name__ == "__main__":
    try:
        test_hook_validation()
        test_style_propagation()
        test_rewatch_loop()
        logger.info("--- ALL PSYCHOLOGY TESTS PASSED ---")
    except Exception as e:
        logger.error(f"Verification FAILED: {e}")
        sys.exit(1)
