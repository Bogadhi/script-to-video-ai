"""
AI Visual Generation Engine
===========================
Interfaces with real Image Generation services (e.g. Stable Diffusion / Stability API)
to generate high-quality visual sequences directed by the Agent designer.
"""

import os
import time
import requests
import logging
from typing import List

logger = logging.getLogger(__name__)

# Fallback structure: Assuming usage of Stability API (REST) or generic OpenAI-like DALL-E wrapper
# Configurable via environment strings
SD_API_URL = "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image"

def generate_images(prompt: str, count: int = 4, project_dir: str = "", scene_idx: int = 0) -> List[str]:
    """
    Calls out to Stable Diffusion (or similar Image API) to generate literal image assets.
    Saves outputs locally into the project's 'assets' directory.
    Returns list of absolute native file paths.
    """
    api_key = os.environ.get("STABILITY_API_KEY", "")
    
    # Target directory structure
    assets_dir = os.path.join(project_dir, "assets") if project_dir else "/tmp/assets"
    os.makedirs(assets_dir, exist_ok=True)
    
    output_paths = []
    
    if not api_key:
        logger.error("[ai_visual_engine] STABILITY_API_KEY missing. Cannot utilize real Stable Diffusion API.")
        raise RuntimeError("Missing generic Text-to-Image API token.")

    logger.info(f"[ai_visual_engine] Provider=stability scene={scene_idx} count={count}")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    # Attempt fetching via Stability
    payload = {
        "text_prompts": [
            {
                "text": prompt,
                "weight": 1
            }
        ],
        "cfg_scale": 7,
        "height": 1024,
        "width": 1024,
        "samples": min(count, 10),
        "steps": 30,
    }

    try:
        response = requests.post(SD_API_URL, headers=headers, json=payload, timeout=45)
        response.raise_for_status()
        
        response_json = response.json()
        import base64
        
        for i, image in enumerate(response_json.get("artifacts", [])):
            fname = f"ai_gen_scene_{scene_idx}_opt_{i}.jpg"
            fpath = os.path.join(assets_dir, fname)
            
            with open(fpath, "wb") as f:
                f.write(base64.b64decode(image["base64"]))
            
            output_paths.append(fpath)
            
        logger.info(f"[ai_visual_engine] Generation successful. Wrote {len(output_paths)} images.")
        
    except Exception as e:
        logger.error(f"[ai_visual_engine] Fetching from SD API failed natively: {e}")
        raise RuntimeError("Failed to generate AI images natively") from e

    return output_paths
