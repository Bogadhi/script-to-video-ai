"""
Unified AI/Gemini Engine
========================
Makes ONE Gemini API call per video request to generate:
- Viral script
- Scene breakdown (text, keywords, emotion, intent)
- Thumbnail text options
- Basic SEO (title, description, tags)

Caches results per topic hash to avoid duplicate API calls.
"""

import os
import re
import json
import hashlib
import logging
from typing import Optional

import dotenv

dotenv.load_dotenv()

logger = logging.getLogger(__name__)

# ── Stop words for keyword cleaning ─────────────────────────────────────────
STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "must", "can", "could", "to", "of", "in",
    "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "above", "below", "between", "under",
    "again", "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "no", "nor", "not", "only", "own", "same",
    "so", "than", "too", "very", "just", "about", "also", "and", "but",
    "or", "if", "while", "this", "that", "these", "those", "it", "its",
    "you", "your", "we", "our", "they", "their", "he", "she", "him",
    "her", "his", "my", "me", "i", "what", "which", "who", "whom",
    "up", "out", "off", "over", "down", "like", "get", "got", "let",
    "make", "made", "take", "took", "come", "go", "went", "know", "think",
    "see", "look", "want", "give", "use", "find", "tell", "ask", "work",
    "seem", "feel", "try", "leave", "call", "keep", "really", "actually",
    "even", "still", "already", "ever", "never", "always", "sometimes",
    "often", "usually", "much", "many", "well", "back", "now", "new",
    "old", "good", "great", "big", "small", "long", "little", "right",
    "last", "first", "next", "thing", "something", "anything",
    "cinematic", "footage", "video", "image", "picture", "photo",
    "there's", "it's", "that's", "what's", "don't", "doesn't", "didn't",
    "won't", "can't", "couldn't", "shouldn't", "wouldn't", "isn't",
    "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't",
}


def _clean_keyword(word: str) -> str:
    """Strip punctuation and normalize a single keyword."""
    return re.sub(r"[^a-zA-Z0-9]", "", word).lower().strip()


def _extract_clean_keywords(text: str, max_count: int = 4) -> list[str]:
    """Extract meaningful visual keywords from text, filtering stop words."""
    words = text.split()
    clean = []
    for w in words:
        cleaned = _clean_keyword(w)
        if cleaned and len(cleaned) > 2 and cleaned not in STOP_WORDS:
            clean.append(cleaned)
    # Deduplicate while preserving order
    seen = set()
    result = []
    for w in clean:
        if w not in seen:
            seen.add(w)
            result.append(w)
        if len(result) >= max_count:
            break
    return result


# ── Cache (in-process, Celery-safe key store) ──────────────────────────────
_CACHE: dict[str, dict] = {}

def _cache_key(topic: str, category: str) -> str:
    import re
    norm_topic = re.sub(r'[^a-z0-9]', '', topic.lower())
    norm_category = re.sub(r'[^a-z0-9]', '', category.lower())
    return hashlib.md5(f"{norm_topic[:300]}|{norm_category}".encode()).hexdigest()


# ── Schema ──────────────────────────────────────────────────────────────────
def _empty_result() -> dict:
    return {
        "script": "",
        "scenes": [],
        "thumbnail_text_options": ["Watch This!", "You Won't Believe This"],
        "basic_seo": {
            "title": "Amazing Video",
            "description": "Watch this incredible video.",
            "tags": ["viral", "trending", "amazing"],
        },
    }


# ── Rule-based fallback ─────────────────────────────────────────────────────
def _rule_based_generate(script_text: str, category: str) -> dict:
    """Pure rule-based generation — no API calls required."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", script_text) if s.strip()]
    if not sentences:
        sentences = [script_text]

    scenes = []
    emotions = ["epic", "mystery", "calm", "educational", "emotional"]
    intents = ["hook", "info", "info", "climax", "cta"]

    for i, text in enumerate(sentences):
        words = text.split()
        # Use cleaned keyword extraction instead of raw word slicing
        keywords = _extract_clean_keywords(text, max_count=4)
        scenes.append({
            "index": i + 1,
            "text": text,
            "keywords": keywords,
            "visual_keywords": keywords,
            "emotion": emotions[i % len(emotions)],
            "intent": intents[i % len(intents)],
            "duration_sec": max(3.0, len(words) * 0.45),
            "shot_type": "wide" if i == 0 else "medium",
        })

    # Basic SEO from script text
    all_keywords = _extract_clean_keywords(script_text, max_count=15)
    tags = list(set(["viral", "trending", category] + all_keywords))[:15]

    title_base = sentences[0][:55] if sentences else script_text[:55]
    thumbnail_texts = [
        " ".join(title_base.split()[:4]).upper(),
        f"MUST SEE: {' '.join(title_base.split()[:3]).upper()}",
    ]

    return {
        "script": script_text,
        "scenes": scenes,
        "thumbnail_text_options": thumbnail_texts,
        "basic_seo": {
            "title": f"{title_base.rstrip('.!?')} 😮",
            "description": (
                f"🔥 {script_text}\n\n"
                "📌 Subscribe for more incredible content!\n"
                "👍 Like and share if this blew your mind!\n\n"
                "💡 Create amazing videos like this using AI:\n"
                "→ https://scripttovideo.ai\n\n"
                f"#{' #'.join(tags[:5])}"
            ),
            "tags": tags,
        },
    }


# ── Gemini LLM Generation ───────────────────────────────────────────────────
def _llm_generate(script_text: str, category: str, style: str = "viral", niche: str = "general") -> Optional[dict]:
    """⚠️ DISABLED: Gemini API removed. Always use fallback."""
    logger.info("[gemini_engine] Gemini API disabled — using fallback scene generator")
    return None


# ── Public API ──────────────────────────────────────────────────────────────
def generate_content_package(
    script_text: str,
    category: str = "general",
    style: str = "viral",
    niche: str = "general",
    use_cache: bool = True,
) -> dict:
    """
    Main entry point. Returns a unified content package from one Gemini call.
    Falls back to rule-based generation if Gemini is unavailable.

    Returns:
        {
            script: str,
            scenes: List[dict],
            thumbnail_text_options: List[str],
            basic_seo: { title, description, tags }
        }
    """
    key = _cache_key(f"{script_text[:200]}|{style}|{niche}", category)

    if use_cache and key in _CACHE:
        logger.info("[gemini_engine] Cache hit for key %s", key[:8])
        return _CACHE[key]

    logger.info("[gemini_engine] Generating content package for category=%s style=%s niche=%s", 
                category, style, niche)

    # Phase 14: Hook Validation Loop (Max 3 attempts)
    result = None
    for attempt in range(3):
        res = _llm_generate(script_text, category, style=style, niche=niche)
        if not res or not res.get("scenes"):
            continue
            
        # Validate Scene 1 Hook
        scene1_text = res["scenes"][0].get("text", "").lower()
        banned = ["did you know", "in this video", "today we will"]
        if any(b in scene1_text for b in banned):
            logger.warning("[gemini_engine] Hook rejected: starts with banned phrase. Retrying...")
            continue
            
        # Basic check for curiosity/trigger markers (heuristic)
        triggers = ["can't explain", "don't believe", "weird", "truth", "secret", "shocking", "wrong", "?", "!"]
        has_trigger = any(t in scene1_text for t in triggers)
        if not has_trigger and attempt < 2:
            logger.warning("[gemini_engine] Hook rejected: weak trigger. Retrying...")
            continue
            
        result = res
        break

    # Fallback to rule-based ONLY if Gemini truly failed
    if not result:
        logger.warning("[gemini_engine] Gemini unavailable or failed validation — using rule-based fallback")
        result = _rule_based_generate(script_text, category)

    if use_cache:
        _CACHE[key] = result

    logger.info(
        "[gemini_engine] Generated %d scenes, title=%s",
        len(result.get("scenes", [])),
        result.get("basic_seo", {}).get("title", ""),
    )

    return result
