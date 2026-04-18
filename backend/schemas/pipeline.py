from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class PipelineStep(BaseModel):
    name: str
    status: str
    msg: Optional[str] = None

class Scene(BaseModel):
    index: int
    text: str
    keywords: List[str] = Field(default_factory=list)
    visual_keywords: List[str] = Field(default_factory=list)
    duration_sec: float = Field(default=4.0, gt=0)
    emotion: str = "calm"
    intent: str = "info"
    type: str = "build"
    shot_type: str = "medium"
    is_hook: bool = False
    is_pattern_interrupt: bool = False
    effect: str = "none"
    style: str = "viral"
    niche: str = "general"
    is_loop: bool = False
    
    # V3.1 Quality Metrics
    clip_score: float = 0.0
    clip_embedding: Optional[List[float]] = None
    regen_count: int = 0
    
    # Artifact paths
    audio_file: Optional[str] = None
    video_clip: Optional[str] = None
    assembled_clip: Optional[str] = None
    media_fail_count: int = 0

class VoiceRequest(BaseModel):
    text: str
    out_path: str
    voice_style: str = "documentary"
    duration_hint: float = Field(default=4.0, gt=0)
    scene_index: int = 1
    is_hook: bool = False
    is_reveal: bool = False
    is_ending: bool = False
    emotion: str = "calm"
    style: str = "viral"
    niche: str = "general"

class VoiceResponse(BaseModel):
    success: bool
    audio_path: Optional[str] = None
    duration: float = 0.0
    error: Optional[str] = None

class MediaRequest(BaseModel):
    visual_intent: Dict[str, Any] | List[str]
    out_path: str
    prefer_video: bool = True
    scene_index: int = 1
    style: str = "viral"
    niche: str = "general"

class MediaResponse(BaseModel):
    success: bool
    media_path: Optional[str] = None
    error: Optional[str] = None

class PipelineState(BaseModel):
    project_id: str
    project_dir: str
    script_text: str
    config: Dict[str, Any] = Field(default_factory=dict)
    scenes: List[Scene] = Field(default_factory=list)
    steps: List[PipelineStep] = Field(default_factory=list)
    current_step: str = "pending"
    current_scene_index: int = 0
    completed_scenes: List[int] = Field(default_factory=list)
    failed_scenes: List[int] = Field(default_factory=list)
    progress: float = 0.0
    overall_status: str = "starting"
    last_successful_step: Optional[str] = None
    error: Optional[str] = None
    qa_attempt: int = 0
    max_qa_retries: int = 3
    is_resume: bool = False
