from __future__ import annotations

"""
Scene Intelligence Engine
=========================
Processes raw scenes from gemini_engine with:
- Auto hook detection (first scene)
- Emotion normalization + progression arc
- Intent classification (including retention_hook)
- Duration validation
- Multi-shot splitting (long scenes → 2-3 sub-clips)
- Pattern interrupts (visual contrast every 2-3 scenes)
"""

import re
import logging
import random
from copy import deepcopy
from typing import List

logger = logging.getLogger(__name__)

VALID_EMOTIONS = {"epic", "mystery", "calm", "educational", "emotional", "neutral", "cinematic", "curiosity", "surprise"}
VALID_INTENTS = {"hook", "info", "climax", "cta", "build", "retention_hook"}

# Target scene duration for pacing
MAX_SCENE_DURATION = 3.5
MIN_SCENE_DURATION = 2.0

# Emotion progression arc for viral retention
EMOTION_ARC = {
    "early": ["curiosity", "mystery"],         # Build intrigue
    "middle": ["epic", "educational", "calm"],  # Deliver value
    "late": ["surprise", "emotional"],          # Twist / impact
    "final": ["curiosity", "surprise"],         # Loop / cliffhanger
}

# Pattern interrupt visual keywords (injected every 2-3 scenes)
PATTERN_INTERRUPT_VISUALS = [
    ["extreme close up texture", "macro detail"],
    ["aerial drone view landscape", "birds eye view"],
    ["dark moody silhouette", "dramatic shadows"],
    ["underwater camera view", "deep ocean perspective"],
    ["time lapse clouds moving", "fast motion city"],
    ["slow motion explosion", "impact slow motion"],
    ["neon lights abstract", "glowing particles"],
]


def _normalize_emotion(raw: str) -> str:
    raw = (raw or "calm").lower().strip()
    return raw if raw in VALID_EMOTIONS else "calm"


def _apply_emotion_arc(idx: int, total: int, raw_emotion: str) -> str:
    """Apply emotion progression arc based on scene position."""
    normalized = _normalize_emotion(raw_emotion)

    # If Gemini already set a good emotion, respect it
    if normalized in {"curiosity", "surprise", "mystery"}:
        return normalized

    # Otherwise, apply the arc
    progress = idx / max(total - 1, 1)  # 0.0 → 1.0

    if progress <= 0.15:  # First ~15%
        return random.choice(EMOTION_ARC["early"])
    elif progress <= 0.6:  # Middle ~45%
        return normalized if normalized in EMOTION_ARC["middle"] else random.choice(EMOTION_ARC["middle"])
    elif progress <= 0.85:  # Late ~25%
        return random.choice(EMOTION_ARC["late"])
    else:  # Final ~15%
        return random.choice(EMOTION_ARC["final"])


def _normalize_intent(raw: str, idx: int, total: int) -> str:
    raw = (raw or "").lower().strip()
    if raw in VALID_INTENTS:
        return raw
    if idx == 0:
        return "hook"
    if idx == total - 1:
        return "cta"
    if idx >= total - 2:
        return "climax"
    return "info"


def _should_insert_pattern_interrupt(scene_idx: int) -> bool:
    """Return True every 2-3 scenes to create visual contrast."""
    return scene_idx > 0 and scene_idx % 3 == 0


def _get_interrupt_visuals(scene_idx: int) -> list[str]:
    """Get pattern interrupt visual keywords for this scene."""
    return random.choice(PATTERN_INTERRUPT_VISUALS)


def split_scene(scene: Scene, idx: int) -> list[Scene]:
    # 🔥 Hook optimization (first scene)
    if idx == 0:
        scene.duration_sec = min(scene.duration_sec, 2.0)

    # 🔥 Hard cap duration
    scene.duration_sec = min(scene.duration_sec, MAX_SCENE_DURATION)

    if scene.duration_sec <= 3:
        return [scene]

    # 🔥 Split logic
    parts = 2 if scene.duration_sec < 6 else 3
    split_duration = scene.duration_sec / parts

    scenes = []
    for i in range(parts):
        new_scene = deepcopy(scene)
        new_scene.duration_sec = split_duration
        scenes.append(new_scene)

    return scenes


def _split_scene_text(text: str) -> list[str]:
    """
    Split long narration into 2-3 sub-segments for multi-shot visuals.
    """
    # Step 1: Sentence splits
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    if len(sentences) >= 2:
        return sentences[:3]

    # Step 2: Comma/semicolon splits
    clauses = [c.strip() for c in re.split(r'[,;]\s+', text) if c.strip() and len(c.strip()) > 10]
    if len(clauses) >= 2:
        return clauses[:3]

    # Step 3: Midpoint split
    words = text.split()
    if len(words) > 12:
        mid = len(words) // 2
        return [" ".join(words[:mid]), " ".join(words[mid:])]

    return [text]


from schemas.pipeline import Scene

def process_scenes(raw_scenes: List[dict], style: str = "viral", niche: str = "general") -> List[Scene]:
    """
    Normalize, enrich, and split scenes with:
    - Multi-shot sub-clips
    - Emotion progression arc
    - Rewatch loop logic (Phase 16)
    - Pattern interrupts every 2-3 scenes
    """
    if not raw_scenes:
        return []

    total = len(raw_scenes)
    processed = []
    scene_counter: int = 0
    
    # Phase 16: Rewatch Bridge Context
    hook_subject = raw_scenes[0].get("visual_intent", {}).get("subject", "hero") if raw_scenes else "hero"

    for i, scene in enumerate(raw_scenes):
        text = scene.get("text", "").strip()
        if not text:
            continue

        keywords = scene.get("keywords") or []
        visual_keywords = scene.get("visual_keywords") or keywords
        raw_emotion = scene.get("emotion", "calm")
        intent = _normalize_intent(scene.get("intent"), i, total)
        is_hook = (i == 0) or (intent == "hook")
        
        # Phase 16: Pre-split Loop Detection
        is_loop_scene = (i == total - 1) and any(x in text.lower() for x in ["loop", "why", "..."])

        # Multi-shot: split long scenes
        sub_texts = _split_scene_text(text)

        for j, sub_text in enumerate(sub_texts):
            scene_counter += 1
            words = sub_text.split()

            # Apply emotion progression arc
            emotion = _apply_emotion_arc(scene_counter - 1, total * 2, raw_emotion)

            # Pattern interrupt: swap visuals every 2-3 scenes for contrast
            is_interrupt = _should_insert_pattern_interrupt(scene_counter - 1)
            if is_interrupt:
                sub_vk = _get_interrupt_visuals(scene_counter)
                effect = random.choice(["zoom", "flash", "motion"])
                logger.debug("[scene_engine] Pattern interrupt (effect: %s) at scene %d", effect, scene_counter)
            else:
                effect = "none"
                sub_vk = []
                if visual_keywords:
                    sub_vk = [visual_keywords[j % len(visual_keywords)]]
                if not sub_vk:
                    # Smart fallback: extract meaningful content words (nouns/verbs)
                    stop = {"what", "that", "there", "are", "from", "some", "most",
                             "like", "they", "lets", "told", "dont", "our", "with",
                             "have", "this", "which", "into", "been", "will", "dont"}
                    content_words = [w.strip(",.?!'\")") for w in words
                                     if len(w) > 4 and w.lower().strip(",.?!'\")") not in stop]
                    sub_vk = content_words[:3] or ["cinematic landscape aerial"]
                # Always append a cinematic quality descriptor to improve stock search
                if sub_vk and "cinematic" not in " ".join(sub_vk).lower():
                    sub_vk = [sub_vk[0] + " cinematic 4k"] + sub_vk[1:]

            sub_kw = keywords[:3] if keywords else sub_vk

            duration = max(MIN_SCENE_DURATION, len(words) * 0.45)
            duration = min(duration, MAX_SCENE_DURATION)

            # Shot variety with pattern interrupts
            shot_types = ["wide", "medium", "close", "extreme_close", "aerial"]
            if is_hook and j == 0:
                shot = "wide"
            elif i == total - 1 and j == len(sub_texts) - 1:
                # Phase 16: Loop Connection Shot
                shot = "medium" # Safe bridge shot
            elif is_interrupt:
                shot = random.choice(["extreme_close", "aerial", "close"])
            else:
                shot = shot_types[(scene_counter + j) % len(shot_types)]

            scene_obj = Scene(
                index=scene_counter,
                text=sub_text,
                keywords=sub_kw[:5],
                visual_keywords=sub_vk[:4],
                emotion=emotion,
                intent=intent if j == 0 else "info",
                duration_sec=duration,
                shot_type=shot,
                is_hook=is_hook and j == 0,
                is_pattern_interrupt=is_interrupt,
                effect=effect,
                style=style,
                niche=niche,
                is_loop=is_loop_scene and j == len(sub_texts) - 1,
            )
            scene_obj.duration_sec = min(scene_obj.duration_sec, MAX_SCENE_DURATION)
            if scene_obj.index == 1:
                scene_obj.duration_sec = min(scene_obj.duration_sec, 2.0)

            if scene_obj.duration_sec > 3.0:
                half_duration = scene_obj.duration_sec / 2
                scene_part_1 = scene_obj.copy(update={
                    "duration_sec": half_duration,
                    "index": scene_counter,
                    "is_loop": False,
                })
                scene_part_2 = scene_obj.copy(update={
                    "duration_sec": scene_obj.duration_sec - half_duration,
                    "index": scene_counter + 1,
                    "is_loop": scene_obj.is_loop,
                })
                processed.append(scene_part_1)
                processed.append(scene_part_2)
                scene_counter += 1
            else:
                processed.append(scene_obj)

    final_scenes = []
    for idx, scene_obj in enumerate(processed):
        final_scenes.extend(split_scene(scene_obj, idx))

    # Phase 16: Final Reveal/Rewatch Adjustment
    if final_scenes:
        final_scene = final_scenes[-1]
        if final_scene.is_loop:
            # Inject hook subject into final visual intent to bridge the loop
            if hook_subject:
                final_scene.visual_keywords.append(hook_subject.split()[0])
            final_scene.emotion = "curiosity"

    logger.info("[scene_engine] Processed %d raw → %d multi-shot scenes (hook: %s, interrupts: %d)",
                len(raw_scenes), len(final_scenes),
                final_scenes[0].text[:50] if final_scenes else "N/A",
                sum(1 for s in final_scenes if s.is_pattern_interrupt))
    return final_scenes
