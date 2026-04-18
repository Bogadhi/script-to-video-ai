"""
YouTube Optimizer (Non-Blocking)
=================================
Generates optimization suggestions for YouTube uploads.
Designed to NEVER block the main pipeline.
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def generate_optimization_report(
    title: str,
    description: str,
    tags: list[str],
    category: str = "general",
) -> dict:
    """
    Generate non-blocking YouTube optimization suggestions.
    Returns a structured report — if anything fails, returns empty report.
    """
    try:
        suggestions = []
        score = 100

        # Title checks
        if len(title) > 60:
            suggestions.append("⚠ Title is too long (>60 chars). Shorten for better CTR.")
            score -= 10
        elif len(title) < 30:
            suggestions.append("💡 Title is short. Add more descriptive keywords.")
            score -= 5

        if not re.search(r"[😮🔥🚨💥❗?!]", title):
            suggestions.append("💡 Add an emoji or ! to your title for +15% CTR boost.")
            score -= 5

        if not re.search(r"\b\d+\b", title):
            suggestions.append("💡 Add a number to your title (e.g., '5 Reasons'). Numbers boost CTR.")
            score -= 5

        # Description checks
        if len(description) < 200:
            suggestions.append("⚠ Description too short. Add 200–400 words for better SEO.")
            score -= 15
        if "subscribe" not in description.lower():
            suggestions.append("💡 Add a Subscribe CTA in your description.")
            score -= 5
        if "#" not in description:
            suggestions.append("💡 Add 3–5 hashtags to your description.")
            score -= 5

        # Tags checks
        if len(tags) < 8:
            suggestions.append(f"⚠ Only {len(tags)} tags. Add up to 15 for maximum reach.")
            score -= 10

        # Retention hooks
        retention_tips = [
            "🎬 Hook tip: First 5 seconds should answer 'Why should I watch this?'",
            "🔄 Pattern interrupt: Cut to a different visual every 3-5 seconds.",
            "❓ Curiosity loop: End scenes with implied questions to keep viewers watching.",
        ]

        upload_time = _best_upload_time(category)

        return {
            "optimization_score": max(score, 0),
            "suggestions": suggestions,
            "retention_tips": retention_tips,
            "best_upload_time": upload_time,
            "monetization_tips": [
                "Enable mid-roll ads after 8 minutes for max revenue.",
                "Add card/end screen at 20s before end to boost watch time.",
                "Use chapters to improve search indexing.",
            ],
        }

    except Exception as e:
        logger.warning("[youtube_optimizer] Failed (non-blocking): %s", e)
        return {}


def _best_upload_time(category: str) -> str:
    times = {
        "travel": "Friday 8AM EST",
        "finance": "Tuesday 7AM EST",
        "science": "Wednesday 6PM EST",
        "entertainment": "Saturday 10AM EST",
        "education": "Monday 9AM EST",
    }
    return times.get(category.lower(), "Tuesday-Thursday, 6-9 PM EST")
