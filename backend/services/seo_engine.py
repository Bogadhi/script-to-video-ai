"""
SEO Engine
==========
Generates YouTube-optimized metadata using Gemini output.

Phase 1: Pass-through from gemini_engine with enhancements.
Phase 2 (non-blocking): CTR scoring, SEO strength scoring.
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Phase 1: Enhance raw Gemini SEO ─────────────────────────────────────────
def build_seo_package(
    gemini_seo: dict,
    script: str,
    category: str,
    thumbnail_text: str = "",
) -> dict:
    """
    Enhance the raw SEO from gemini_engine.
    
    Returns:
        {
            title: str,
            title_ab: str,              # A/B variant
            description: str,
            tags: List[str],
            hashtags: List[str],
            youtube_upload: dict,
            ctr_score: int,             # 0-100
            seo_strength: int,          # 0-100
        }
    """
    title = (gemini_seo.get("title") or "").strip()

    # Phase 11: Title Alignment (Sync with thumbnail text)
    if thumbnail_text:
        upper_text = thumbnail_text.upper()
        if "REAL?!" in upper_text:
            title = "Is this actually real? Scientists can’t explain this."
        elif "SHOULDN'T EXIST" in upper_text:
            title = "This shouldn't exist. The shocking truth revealed!"
        elif "CAN EXPLAIN" in upper_text:
            title = "No one can explain this strange phenomenon."
        elif "BELIEVE THIS" in upper_text:
            title = "You won't believe this is actually happening."

    # Phase 30: Unique Value Description (No Script Reuse)
    description = (gemini_seo.get("description") or "").strip()
    
    # Heuristic: if description is too short or contains >50% of the script, reject it
    script_words = set(script.lower().split())
    desc_words = set(description.lower().split())
    overlap = len(script_words.intersection(desc_words)) / max(len(desc_words), 1)
    
    if overlap > 0.5 or len(description) < 60:
        logger.warning("[seo_engine] Description reused script too much or too short. Regenerating...")
        description = f"🔥 {title}\n\nEver wondered about the hidden truth behind {category}? In this video, we dive deep into {thumbnail_text or 'the mystery'}.\n\nYou'll discover exactly why this changes everything. 🎬"

    tags = gemini_seo.get("tags") or []

    # Ensure title is ≤ 60 chars
    if len(title) > 60:
        title = title[:57] + "..."

    # A/B title variant
    title_ab = _ab_title(title)

    # Enhance description with CTA block
    description = _enhance_description(description, tags)

    # Hashtags (top 10)
    hashtags = [f"#{t.replace(' ', '')}" for t in tags[:10]]

    # YouTube metadata
    youtube_upload = {
        "category_id": _category_id(category),
        "language": "en",
        "audience": "general",
        "visibility": "public",
        "caption_suggestion": "Add auto-generated captions for accessibility.",
        "best_upload_time": "Tuesday-Thursday, 6-9 PM EST",
    }

    # Phase 2: Scoring (non-blocking)
    ctr_score = _score_ctr(title, thumbnail_text)
    seo_strength = _score_seo(tags, description, title)

    logger.info(
        "[seo_engine] CTR score: %d, SEO strength: %d, title: %s",
        ctr_score, seo_strength, title,
    )

    return {
        "title": title,
        "title_ab": title_ab,
        "description": description,
        "tags": tags[:15],
        "hashtags": hashtags,
        "youtube_upload": youtube_upload,
        "ctr_score": ctr_score,
        "seo_strength": seo_strength,
    }


def _ab_title(title: str) -> str:
    """Simple A/B title variant — reorders the emotional hook."""
    # If title has a number, swap it to front
    m = re.search(r"\d+", title)
    if m:
        num = m.group()
        rest = title.replace(num, "").strip().lstrip(":#-").strip()
        return f"{num} Reasons Why {rest}"

    # Otherwise add a curiosity trigger
    if "?" not in title:
        return f"Why {title}?"
    return title.replace("?", "... Here's Why")


def _enhance_description(description: str, tags: list) -> str:
    """Ensure description has a CTA block and keyword-rich footer."""
    cta_block = (
        "\n\n---\n"
        "📌 SUBSCRIBE for more incredible content: https://youtube.com/@YourChannel\n"
        "👍 LIKE if this amazed you!\n"
        "💬 COMMENT your thoughts below!\n\n"
        "💡 Create videos like this AI-powered:\n"
        "→ https://scripttovideo.ai\n"
    )

    hashtag_line = " ".join(f"#{t.replace(' ', '')}" for t in tags[:5])

    if cta_block.strip()[:10] not in description:
        description = description + cta_block

    if hashtag_line and hashtag_line not in description:
        description += f"\n{hashtag_line}"

    return description.strip()


def _category_id(category: str) -> str:
    mapping = {
        "travel": "19",
        "finance": "22",
        "science": "28",
        "tech": "28",
        "entertainment": "24",
        "education": "27",
        "news": "25",
        "gaming": "20",
        "nature": "15",
        "howto": "26",
    }
    return mapping.get(category.lower(), "22")


# ── Phase 2: Scoring (non-blocking) ─────────────────────────────────────────
def _score_ctr(title: str, thumbnail_text: str) -> int:
    score = 50
    # Positive signals
    if any(c in title for c in ["?", "!", "😮", "🔥", "🚨"]):
        score += 10
    if re.search(r"\b\d+\b", title):
        score += 10  # Numbers boost CTR
    if len(title) <= 50:
        score += 5
    if thumbnail_text and len(thumbnail_text.split()) <= 5:
        score += 10
    if re.search(r"\b(how|why|what|secret|truth|never|only|best|worst)\b", title, re.I):
        score += 10
    return min(score, 100)


def _score_seo(tags: list, description: str, title: str) -> int:
    score = 30
    if len(tags) >= 8:
        score += 20
    if len(description) >= 200:
        score += 20
    if len(title) >= 30:
        score += 10
    if "#" in description:
        score += 10
    if "subscribe" in description.lower():
        score += 10
    return min(score, 100)
