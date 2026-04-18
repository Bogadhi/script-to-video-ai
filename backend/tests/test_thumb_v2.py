import os
import sys
import PIL.Image as Image
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.thumbnail_gen import generate_thumbnail

def test_thumb_fail_safe():
    print("--- Testing Thumbnail Fail-Safe ---")
    
    # 1. Test with non-existent file
    output = "tests/fail_safe_thumb.jpg"
    os.makedirs("tests", exist_ok=True)
    
    res = generate_thumbnail("non_existent.mp4", "You Won't Believe This Glow", output)
    print(f"Result path: {res}")
    if os.path.exists(res):
        print("Success: Gradient thumbnail generated as fail-safe.")
    
    # 2. Test with actual image if available
    # (Just verifying the helper logic)
    print("\n--- Verifying load_thumbnail_background (Dummy Call) ---")
    from services.thumbnail_gen import load_thumbnail_background
    img = load_thumbnail_background("invalid_path.jpg")
    print(f"Loaded image size for invalid path: {img.size} (Should be 1280x720 gradient)")

if __name__ == "__main__":
    test_thumb_fail_safe()
