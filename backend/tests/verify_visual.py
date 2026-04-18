import json
from services.scene_analyzer import analyze_script
from services.image_gen import generate_scene_image

script_text = "Did you know there is a beach where the ocean glows at night? Millions of plankton glow when disturbed. This magical phenomenon is called bioluminescence. Suddenly, a massive wave crashes illuminating the entire shore! Truly nature is beautiful."

topic_anchor, scenes = analyze_script(script_text)

print("[VERIFICATION LOGIC]")
print(f"GLOBAL TOPIC ANCHOR: {topic_anchor}")
for s in scenes:
    print(f"Scene {s['scene_number']} Prompt: {s['visual_prompt']}")
    
# Test Thumbnail prompt creation
print("\n[THUMBNAIL GEN LOGIC]")
thumb_prompt = f"{topic_anchor} {scenes[0]['visual_prompt']} cinematic"
print(f"Thumbnail Background Prompt: {thumb_prompt}")
