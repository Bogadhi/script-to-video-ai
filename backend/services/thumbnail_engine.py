"""
Thumbnail Engine
================
Generates high-quality YouTube thumbnails using:
- ffmpeg for frame extraction (primary thumbnail)
- PIL for text overlay with bold font + drop shadow
- Generates 2 variants (A/B testing)
- Auto-truncates text to 3-4 words for maximum impact
"""

import os
import logging
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

# Phase 11: Power Phrase Rotation (Only allow specific phrases)
VIRAL_PHRASES = [
    "THIS SHOULDN'T EXIST",
    "NO ONE CAN EXPLAIN THIS",
    "THIS IS REAL?!",
    "YOU WON'T BELIEVE THIS",
]

def _generate_viral_thumb_text(text: str) -> str:
    """Generate viral thumbnail text using script context or psychology phrases."""
    import random
    
    # Tier 1: Try to extract a 3-word punchy hook from the script
    clean_text = re.sub(r'[^a-zA-Z\s]', '', text).upper()
    words = clean_text.split()
    if len(words) >= 3:
        # Pick 3-4 interesting words from the start
        punchy = " ".join(words[:4])
        if len(punchy) < 25:
            return punchy

    return random.choice(VIRAL_PHRASES)


def _truncate_thumb_text(text: str, max_words: int = 4) -> str:
    """Generate viral thumbnail text — context-aware."""
    return _generate_viral_thumb_text(text)


def _extract_frame(video_path: str, out_path: str, timestamp: str = "00:00:01") -> bool:
    """Extract a single frame from the video at a given timestamp."""
    for ts in [timestamp, "00:00:00.5", "00:00:00"]:
        r = subprocess.run(
            ["ffmpeg", "-y", "-ss", ts, "-i", video_path,
             "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "2", out_path],
            capture_output=True, timeout=30,
        )
        if r.returncode == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 1000:
            return True
    return False


def _draw_text_overlay(
    base_img_path: str,
    text: str,
    out_path: str,
    variant: int = 1,
) -> bool:
    """
    Add bold text overlay with drop shadow using PIL.
    Text is auto-truncated to 4 words max.
    variant=1 → dark gradient overlay + white text
    variant=2 → colored ribbon + white text
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
        import textwrap

        # Truncate text to 4 words for thumbnail impact
        text = _truncate_thumb_text(text, max_words=4)

        img = Image.open(base_img_path).convert("RGBA")
        w, h = img.size

        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        import random
        placement = random.choice(["top", "bottom"])

        if variant == 1:
            # Dark gradient overlay
            gradient = Image.new("RGBA", (w, h // 2), (0, 0, 0, 180))
            if placement == "top":
                overlay.paste(gradient, (0, 0))
            else:
                overlay.paste(gradient, (0, h - h // 2))
        else:
            # Colored ribbon
            ribbon_color = (220, 50, 50, 210)
            if placement == "top":
                draw.rectangle([0, 20, w, 200], fill=ribbon_color)
            else:
                draw.rectangle([0, h - 200, w, h - 20], fill=ribbon_color)

        # Merge overlay with base
        combined = Image.alpha_composite(img, overlay).convert("RGB")
        draw_final = ImageDraw.Draw(combined)

        # Auto-scale font based on text length to respect safe zones
        max_width = int(w * 0.85)
        font = None
        font_size = 110
        font_paths = [
            "C:/Windows/Fonts/Impact.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/TTF/OpenSans-Bold.ttf",
            "Arial.ttf",
        ]

        # Binary search for perfect font size
        min_f, max_f = 20, 150
        while min_f <= max_f:
            mid = (min_f + max_f) // 2
            test_font = None
            for fp in font_paths:
                if os.path.isfile(fp):
                    try:
                        test_font = ImageFont.truetype(fp, mid)
                        break
                    except Exception:
                        continue
            if test_font is None:
                test_font = ImageFont.load_default()
                font = test_font
                break

            bbox = draw_final.textbbox((0, 0), text, font=test_font)
            text_w = bbox[2] - bbox[0]

            if text_w <= max_width:
                font = test_font
                font_size = mid
                min_f = mid + 1
            else:
                max_f = mid - 1

        if font is None:
            font = ImageFont.load_default()

        # Phase 11: Top OR bottom placement only
        bbox = draw_final.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        x = (w - text_w) // 2
        if placement == "top":
            y = 40 + ((140 - text_h) // 2)
        else:
            y = h - 180 + ((160 - text_h) // 2)

        # Thick shadow for contrast
        shadow_color = (0, 0, 0, 240)
        offset = max(3, font_size // 12)
        for dx, dy in [(offset, offset), (-offset, offset), (offset, -offset), (-offset, -offset), (0, offset), (0, -offset)]:
            draw_final.text((x + dx, y + dy), text, font=font, fill=shadow_color)

        # Main text (Phase 30: BIG + WHITE)
        draw_final.text((x, y), text, font=font, fill=(255, 255, 255))

        combined.save(out_path, "JPEG", quality=95)
        logger.info("[thumbnail_engine] Text overlay created: '%s'", text)
        return True

    except ImportError:
        logger.warning("[thumbnail_engine] PIL not installed, using raw frame")
        import shutil
        shutil.copy2(base_img_path, out_path)
        return True
    except Exception as e:
        logger.error("[thumbnail_engine] Text overlay failed: %s", e)
        import shutil
        shutil.copy2(base_img_path, out_path)
        return True


def generate_thumbnails(
    video_path: str,
    text: str,
    project_dir: str,
) -> dict[str, Optional[str]]:
    """
    Generate 2 thumbnail variants.

    Returns:
        {
            "primary": "/path/to/thumbnail.jpg",
            "variant": "/path/to/thumbnail_variant.jpg"
        }
    """
    results: dict[str, Optional[str]] = {"primary": None, "variant": None}

    # Phase 30: Cinematic Thumbnail (Subject Focus)
    # 1. Fetch clean subjects via media_engine (image mode)
    from services.media_engine import fetch_best_media
    
    raw_frame = os.path.join(project_dir, "thumbnail_raw.jpg")
    
    # Try multiple subjects from the script context
    subject = text.split(".")[0] if "." in text else text
    
    logger.info("[thumbnail_engine] Fetching high-contrast subject for thumbnail: %s", subject)
    media_result = fetch_best_media(
        visual_intent={"subject": subject, "environment": "cinematic studio lighting", "mood": "epic", "shot_type": "close_up"},
        out_path=raw_frame,
        prefer_video=False # Enforce image fetching
    )

    if not media_result or not os.path.isfile(raw_frame):
        logger.warning("[thumbnail_engine] Media fetch failed, falling back to frame extraction")
        if not _extract_frame(video_path, raw_frame):
            return results

    # Phase 31: Director's Thumb (3 Words + Concept-Only)
    thumb_text = _truncate_thumb_text(text, max_words=3)
    
    # Concept-Only Search (Ignore literal script, fetch dramatic concept)
    concept = thumb_text
    if len(concept.split()) < 2:
        concept = f"epic dramatic {category} {concept}"

    logger.info("[thumbnail_engine] Fetching High-Contrast Concept for thumbnail: %s", concept)
    media_result = fetch_best_media(
        visual_intent={"subject": concept, "environment": "cinematic dark background", "mood": "extreme impact", "shot_type": "close_up"},
        out_path=raw_frame,
        prefer_video=False # Enforce image
    )
    # Primary thumbnail (dark overlay)
    primary_path = os.path.join(project_dir, "thumbnail.jpg")
    if _draw_text_overlay(raw_frame, thumb_text, primary_path, variant=1):
        results["primary"] = primary_path
        logger.info("[thumbnail_engine] Primary created: %s", primary_path)

    # A/B variant (red ribbon)
    variant_path = os.path.join(project_dir, "thumbnail_b.jpg")
    if _draw_text_overlay(raw_frame, thumb_text, variant_path, variant=2):
        results["variant"] = variant_path
        logger.info("[thumbnail_engine] Variant B created: %s", variant_path)

    return results
