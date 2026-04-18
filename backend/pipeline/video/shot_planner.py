from typing import List

SHOT_TYPES = ["wide", "medium", "close up", "aerial", "macro", "slow motion"]

def generate_shot_sequence(clip_count: int, scene_index: int) -> List[str]:
    """
    Generate a cinematic shot sequence based on clip count.
    Follows visual grammar: progressive intimacy (Wide -> Medium -> Close).
    """
    print(f"[Shot Planner] Planning {clip_count} shots for scene {scene_index}")
    
    if clip_count <= 1:
        return ["medium"]
    
    if clip_count == 2:
        return ["wide", "close up"]
        
    if clip_count == 3:
        return ["wide", "medium", "close up"]
        
    # Standard 4-clip cinematic progression
    # Aerial -> Wide -> Medium -> Close
    base_sequence = ["aerial", "wide", "medium", "close up"]
    
    if clip_count == 4:
        return base_sequence
    
    # For clip_count > 4, cycle through SHOT_TYPES avoiding consecutive repeats
    sequence = base_sequence[:]
    while len(sequence) < clip_count:
        last = sequence[-1]
        available = [s for s in SHOT_TYPES if s != last]
        sequence.append(available[len(sequence) % len(available)])
        
    print(f"[Shot Planner] Sequence: {' -> '.join(sequence)}")
    return sequence
