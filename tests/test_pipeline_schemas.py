import pytest
from pydantic import ValidationError
from backend.schemas.pipeline import Scene, VoiceRequest, MediaRequest, PipelineState

def test_scene_validation():
    # Valid scene
    scene = Scene(index=1, text="Hello world", duration_sec=5.0)
    assert scene.index == 1
    assert scene.text == "Hello world"
    assert scene.duration_sec == 5.0

    # Invalid duration
    with pytest.raises(ValidationError):
        Scene(index=1, text="Hello", duration_sec=-1)

def test_voice_request():
    req = VoiceRequest(text="Hello", voice_id="abc", project_id="p1")
    assert req.text == "Hello"
    assert req.voice_id == "abc"

def test_pipeline_state():
    state = PipelineState(
        project_id="test_proj",
        project_dir="/tmp/test",
        script_text="Test script",
        scenes=[Scene(index=1, text="Scene 1")]
    )
    assert state.project_id == "test_proj"
    assert len(state.scenes) == 1
    assert state.scenes[0].text == "Scene 1"

    # Test state transitions
    state.current_step = "voice_generation"
    assert state.current_step == "voice_generation"
