import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from pydantic import ValidationError
from schemas.pipeline import Scene, VoiceRequest, MediaRequest, PipelineState

def test_scene_validation():
    print("Testing Scene validation...")
    try:
        scene = Scene(index=1, text="Hello world", duration_sec=5.0)
        assert scene.index == 1
        assert scene.text == "Hello world"
        assert scene.duration_sec == 5.0
        print("✅ Scene valid")
    except Exception as e:
        print(f"❌ Scene validation failed: {e}")
        sys.exit(1)

    try:
        Scene(index=1, text="Hello", duration_sec=-1)
        print("❌ Expected ValidationError for negative duration but got none")
        sys.exit(1)
    except ValidationError:
        print("✅ Scene caught invalid duration")

def test_voice_request():
    print("Testing VoiceRequest...")
    try:
        # out_path is required
        req = VoiceRequest(text="Hello", out_path="test.mp3")
        assert req.text == "Hello"
        print("✅ VoiceRequest valid")
    except Exception as e:
        print(f"❌ VoiceRequest failed: {e}")
        sys.exit(1)

def test_pipeline_state():
    print("Testing PipelineState...")
    try:
        state = PipelineState(
            project_id="test_proj",
            project_dir="/tmp/test",
            script_text="Test script",
            scenes=[Scene(index=1, text="Scene 1")]
        )
        assert state.project_id == "test_proj"
        assert len(state.scenes) == 1
        print("✅ PipelineState valid")
    except Exception as e:
        print(f"❌ PipelineState failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_scene_validation()
    test_voice_request()
    test_pipeline_state()
    print("\n✨ ALL SCHEMA TESTS PASSED")
