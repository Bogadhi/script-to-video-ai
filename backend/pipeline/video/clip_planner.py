from typing import List, Dict, Any

def plan_clips(scene_duration: float, crossfade_duration: float = 0.25) -> Dict[str, Any]:
    """
    Determine the number of clips and their individual durations for a scene.
    Account for crossfades to ensure the final assembled duration matches target.
    Logic: clip_duration = (scene_duration + total_fade_time) / clip_count
    """
    # 🎬 REFINED PACING RULES (Phase 27)
    # Target: 3-4s per clip for maximum retention
    if scene_duration < 3.5:
        clip_count = 1
    elif scene_duration < 6.5:
        clip_count = 2 # ~3.25s per clip
    elif scene_duration < 9.5:
        clip_count = 3 # ~3.16s per clip
    else:
        clip_count = 4 # ~2.5s+ per clip

    if clip_count == 1:
        return {
            "clip_count": 1,
            "clip_durations": [scene_duration],
            "total_fade_time": 0.0
        }

    # Number of transitions is clip_count - 1
    num_fades = clip_count - 1
    total_fade_time = num_fades * crossfade_duration
    
    # Calculate duration per clip to compensate for overlap
    individual_clip_duration = (scene_duration + total_fade_time) / clip_count
    
    return {
        "clip_count": clip_count,
        "clip_durations": [individual_clip_duration] * clip_count,
        "total_fade_time": total_fade_time,
        "crossfade_duration": crossfade_duration
    }
