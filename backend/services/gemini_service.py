"""⚠️ DISABLED: Gemini API integration removed. Use gemini_engine instead."""
import logging

logger = logging.getLogger(__name__)
logger.warning("[gemini_service] This module is deprecated. Use gemini_engine instead.")

# Stub functions for backward compatibility
def generate_script(topic, category="viral facts"):
    """Deprecated. Returns empty string. Use gemini_engine instead."""
    logger.warning("[gemini_service.generate_script] Called but disabled")
    return ""

def generate_seo(script):
    """Deprecated. Returns empty string. Use gemini_engine instead."""
    logger.warning("[gemini_service.generate_seo] Called but disabled")
    return ""



def generate_scenes(script):
    """Deprecated. Returns empty string. Use gemini_engine instead."""
    logger.warning("[gemini_service.generate_scenes] Called but disabled")
    return ""


def generate_thumbnail_text(topic):
    """Deprecated. Returns empty string. Use gemini_engine instead."""
    logger.warning("[gemini_service.generate_thumbnail_text] Called but disabled")
    return ""


def enhance_for_voice(script):
    """Deprecated. Returns empty string. Use gemini_engine instead."""
    logger.warning("[gemini_service.enhance_for_voice] Called but disabled")
    return ""
