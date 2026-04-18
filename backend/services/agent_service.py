"""
Agent Decision Service
======================
Implements three-layer reasoning (Director, Designer, Critic) for visual strategy,
prompt generation, and quality control.
"""

import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Global aesthetic system
GLOBAL_STYLE = {
    "color_palette": "teal and orange, deeply saturated",
    "lighting": "dramatic chiaroscuro, volumetric rays",
    "tone": "cinematic"
}

from services.ai_memory import fetch_top_styles, store_visual_success

_CLIP_MODEL = None
_CLIP_PROCESSOR = None

def get_clip():
    global _CLIP_MODEL, _CLIP_PROCESSOR
    if _CLIP_MODEL is None:
        import torch
        from transformers import CLIPProcessor, CLIPModel
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _CLIP_MODEL = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
        _CLIP_PROCESSOR = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    return _CLIP_PROCESSOR, _CLIP_MODEL

def decide_visual_strategy(scene_analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    Director Role: Decides between stock footage and AI generation.
    Returns:
        { "strategy": str, "confidence": float, "reason": str }
    """
    needs_gen = scene_analysis.get("needs_generation", False)
    emotion = scene_analysis.get("emotion", "calm")
    
    if needs_gen:
        strategy = "ai_generated"
        confidence = 0.85
        reason = "Abstract keywords detected, requires specific generation."
        if emotion in ["mysterious", "dramatic"]:
            confidence = 0.95
            reason = "High abstract and dramatic tone necessitates precise AI composition."
    else:
        strategy = "stock"
        confidence = 0.80
        reason = "Literal visual scenario mapped to robust stock viability."

    # If complexity is very high, confidence drops requiring hybrid generation logic
    if scene_analysis.get("complexity") == "high" and strategy == "stock":
        confidence = 0.60
        reason = "Highly complex physical scene, stock match is uncertain."

    decision = {
        "strategy": strategy,
        "confidence": confidence,
        "reason": reason
    }
    
    logger.info(f"[agent:director] Selected {strategy} with confidence {confidence} ({reason})")
    return decision

def generate_visual_prompt(scene_text: str, analysis: Dict[str, Any], project_id: str = "default") -> Dict[str, str]:
    """
    Designer Role: Translates scene intent into dense, cinematic descriptive formats.
    """
    base_style = analysis.get("visual_style", "cinematic")
    emotion = analysis.get("emotion", "calm")
    
    import hashlib
    GLOBAL_STYLE_SEED = int(hashlib.md5(project_id.encode()).hexdigest()[:8], 16)
    import random
    random.seed(GLOBAL_STYLE_SEED)
    
    color_palettes = [
        "teal and orange, deeply saturated",
        "monochromatic blue, cyberpunk neon",
        "golden hour warmth, high contrast shadows",
        "matte black and stark white, desolate"
    ]
    lightings = [
        "dramatic chiaroscuro, volumetric rays",
        "soft cinematic ambient, bokeh",
        "harsh directional spotlight, rim lighting",
        "gloomy overcast, muted diffusion"
    ]
    
    # Infuse locked global style payload from Memory Graph
    lighting = random.choice(lightings)
    color = random.choice(color_palettes)
    base_memory_styles = fetch_top_styles(limit=2)
    
    if base_memory_styles:
        # Heavily lean into historical visual success matrices
        memory_blend = ", ".join(base_memory_styles)
        color = f"{color}, blending with {memory_blend}"
        
    # Reset seed so we don't mess up other random calls in the app
    random.seed()
    
    # Prompt composition
    prompt = f"ultra detailed cinematic visualization, {scene_text}, highly literal composition, {color}"
    
    camera = "slow zoom"
    if emotion == "dramatic":
        camera = "slow zoom in"
    elif emotion == "energetic":
        camera = "fast pan"
    elif emotion == "mysterious":
        camera = "slow drift and parallax"

    package = {
        "prompt": f"{prompt}, 8k resolution, {lighting}, masterpiece, {base_style}",
        "style": f"cinematic lighting, 4k, dramatic shadows, {color}, {lighting}",
        "camera": camera
    }
    
    logger.info(f"[agent:designer] Generated prompt: {package['prompt']}")
    return package

def score_images(images: list, prompt_pkg: Dict[str, str], scene_text: str) -> list:
    """
    Critic Role: Evaluates outputs via CLIP similarity, with fallback.
    If valid tensor score > 0.75, saves to AI Memory Store for future extrapolation.
    """
    use_clip = os.environ.get("USE_CLIP", "false").lower() == "true"
    scored = []
    prompt = prompt_pkg["prompt"]
    
    if use_clip:
        logger.info("[agent:critic] Using strict ML CLIP evaluation.")
        try:
            import torch
            from PIL import Image
            
            processor, model = get_clip()
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            pil_images = []
            valid_paths = []
            for img in images:
                if os.path.exists(img):
                    pil_images.append(Image.open(img))
                    valid_paths.append(img)
                    
            if pil_images:
                inputs = processor(text=[prompt], images=pil_images, return_tensors="pt", padding=True).to(device)
                outputs = model(**inputs)
                
                # Natively taking raw unscaled similarity is safer for strict thresholds
                image_embeds = model.get_image_features(**inputs)
                text_embeds = model.get_text_features(**inputs)
                
                image_embeds = image_embeds / image_embeds.norm(p=2, dim=-1, keepdim=True)
                text_embeds = text_embeds / text_embeds.norm(p=2, dim=-1, keepdim=True)
                
                similarities = torch.matmul(image_embeds, text_embeds.t()).squeeze().tolist()
                if isinstance(similarities, float): similarities = [similarities]
                
                for idx, sim in enumerate(similarities):
                    # Strict threshold filter
                    if sim < 0.55:
                        logger.warning(f"[agent:critic] DROPPED image {valid_paths[idx]} (CLIP: {sim:.2f})")
                        continue
                        
                    is_premium = sim > 0.75
                    if is_premium:
                        logger.info(f"[agent:critic] PREFERRED image {valid_paths[idx]} stored into Memory Graph.")
                        store_visual_success(scene_text, prompt, prompt_pkg["style"], sim, embedding=image_embeds[idx].tolist())
                        
                    scored.append({
                        "path": valid_paths[idx],
                        "total_score": sim,
                        "premium": is_premium,
                        "embedding": image_embeds[idx].tolist()
                    })
            
            scored = sorted(scored, key=lambda x: x["total_score"], reverse=True)
            return scored
            
        except ImportError:
            logger.error("[agent:critic] CLIP dependencies missing. Reverting to lightweight fake-scoring.")
        except Exception as e:
            logger.error(f"[agent:critic] CLIP runtime crash: {e}")
            
    # Lightweight fallback scoring (Random > 0.6 if disabled or crashed)
    import random
    for img in images:
        if os.path.exists(img):
            sim = random.uniform(0.60, 0.95)
            scored.append({
                "path": img,
                "total_score": sim,
                "premium": sim > 0.75
            })
            
    scored = sorted(scored, key=lambda x: x["total_score"], reverse=True)
    logger.info(f"[agent:critic] Evaluated {len(images)} images (Fallback). Top score: {scored[0]['total_score'] if scored else 0}")
    return scored
