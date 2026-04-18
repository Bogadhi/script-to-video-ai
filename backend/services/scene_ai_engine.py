"""
Scene Intelligence Engine
=========================
Identifies the abstract or literal nature of scene text to decide if AI visual generation is required over stock media.
"""

import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Abstract flags mapping that likely indicate lack of suitable stock imagery
ABSTRACT_KEYWORDS = {
    "imagine", "why", "mystery", "unknown", "secret", "feel", "concept",
    "theory", "truth", "believe", "mind", "soul", "idea", "impossible",
    "dream", "dimension", "energy", "future", "epic", "beyond"
}

def analyze_scene(scene_text: str) -> Dict[str, Any]:
    """
    Analyzes scene text to determine visual generation requirements.
    
    Returns:
    {
        "keywords": list,
        "emotion": str,
        "visual_style": str,
        "complexity": str,
        "needs_generation": bool,
        "confidence": float
    }
    """
    text_lower = scene_text.lower()
    words = set(text_lower.replace(",", "").replace(".", "").split())
    
    # Calculate overlap w.r.t abstract terminology
    abstract_overlap = words.intersection(ABSTRACT_KEYWORDS)
    needs_generation = len(abstract_overlap) > 0
    
    # Heuristics for emotion parsing
    emotion = "calm"
    if any(w in text_lower for w in ["secret", "mystery", "unknown", "truth"]):
        emotion = "mysterious"
    elif any(w in text_lower for w in ["fast", "epic", "boom", "huge", "power"]):
        emotion = "energetic"
    elif any(w in text_lower for w in ["imagine", "dream", "feel", "soul"]):
        emotion = "dramatic"
        
    # Complexity tracking
    complexity = "low"
    if len(words) > 10 or needs_generation:
        complexity = "medium"
    if len(words) > 15 and needs_generation:
        complexity = "high"
        
    visual_style = "cinematic"
    if needs_generation:
        visual_style = "abstract"
        if emotion == "mysterious":
            visual_style = "dark cinematic"

    confidence = 0.8
    if needs_generation and len(abstract_overlap) >= 2:
        confidence = 0.95

    analysis = {
        "keywords": list(words),
        "emotion": emotion,
        "visual_style": visual_style,
        "complexity": complexity,
        "needs_generation": needs_generation,
        "confidence": confidence
    }
    
    logger.info(f"[scene_ai] Analyzed scene: needs_gen={needs_generation}, emotion={emotion}")
    return analysis
