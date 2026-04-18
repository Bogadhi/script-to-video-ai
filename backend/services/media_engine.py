"""
Smart Media Retrieval Engine
=============================
Multi-source fetching (Pexels primary, Pixabay fallback) with:
- Stop-word filtered search queries
- Relevance scoring
- Resolution ranking (HD > SD)
- Video preferred over image
- Disk-based caching to avoid duplicate API calls
"""

import os
import re
import hashlib
import logging
import requests
from typing import Optional

import dotenv

dotenv.load_dotenv()

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "media_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# ── Stop words for query cleaning ────────────────────────────────────────────
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


# ── Cache helpers ────────────────────────────────────────────────────────────
def _hash_url(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def _cached_path(url: str, ext: str) -> str:
    return os.path.join(CACHE_DIR, _hash_url(url) + ext)


def _download_url(url: str, ext: str) -> Optional[str]:
    path = _cached_path(url, ext)
    if os.path.isfile(path) and os.path.getsize(path) > 10_000:
        logger.debug("[media_engine] Cache hit: %s", path)
        return path

    try:
        with requests.get(url, stream=True, timeout=30) as r:
            r.raise_for_status()
            with open(path, "wb") as f:
                for chunk in r.iter_content(chunk_size=16384):
                    f.write(chunk)
        if os.path.getsize(path) > 10_000:
            logger.info("[media_engine] Downloaded: %s (%d bytes)", os.path.basename(path), os.path.getsize(path))
            return path
        os.remove(path)
    except Exception as e:
        logger.warning("[media_engine] Download failed for %s: %s", url[:80], e)

    return None


def _derive_output_path(base_path: str, media_type: str) -> str:
    ext = ".mp4" if media_type == "video" else ".jpg"
    root, _ = os.path.splitext(base_path)
    return root + ext


def _clean_keyword(word: str) -> str:
    """Strip punctuation and normalize."""
    return re.sub(r"[^a-zA-Z0-9]", "", word).lower().strip()


def _clean_keywords(keywords: list[str]) -> list[str]:
    """Filter out stop words, filler words, and short words from keywords."""
    result = []
    seen = set()
    for kw in keywords:
        cleaned = _clean_keyword(kw)
        if cleaned and len(cleaned) > 2 and cleaned not in STOP_WORDS and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def is_clip_relevant(scene_text: str, clip_metadata: dict, scene_duration: float) -> float:
    """
    Hybrid scoring logic combining keyword overlap, semantic similarity, and duration matching.
    Threshold: < 0.55 leads to rejection.
    """
    tags = clip_metadata.get("tags", "").lower()
    clip_dur = float(clip_metadata.get("duration", scene_duration)) 
    
    # 1. Keyword Overlap (0 to 1)
    scene_words = set(scene_text.lower().replace(",", "").replace(".", "").split())
    scene_keywords = _clean_keywords(list(scene_words))
    tag_words = set(tags.split())
    
    overlap_count = len(set(scene_keywords).intersection(tag_words))
    keyword_score = min(1.0, overlap_count / max(1, len(scene_keywords[:3])))
    
    # 2. Semantic Similarity (0 to 1) - Basic heuristic text approximation since we lack heavy vectors
    semantic_score = 0.5 # Baseline
    if any(k in tags for k in scene_keywords):
        semantic_score += 0.3
    if len(scene_keywords) > 0 and len(tag_words) > 0:
        if scene_keywords[0] in tag_words:
            semantic_score += 0.2
            
    semantic_score = min(1.0, semantic_score)
    
    # 3. Duration Match (0 to 1)
    duration_score = 1.0
    if clip_dur < scene_duration:
        duration_score = max(0.0, clip_dur / scene_duration)
        
    final_score = (keyword_score * 0.4) + (semantic_score * 0.4) + (duration_score * 0.2)
    logger.info(f"[media_engine] Scored clip relevance: {final_score:.2f} (key:{keyword_score:.1f}, sem:{semantic_score:.1f}, dur:{duration_score:.1f})")
    return final_score


# ── Pexels ────────────────────────────────────────────────────────────────────
def _search_pexels_videos(query: str, per_page: int = 5) -> list[dict]:
    api_key = os.environ.get("PEXELS_API_KEY", "")
    if not api_key:
        return []

    try:
        resp = requests.get(
            "https://api.pexels.com/videos/search",
            params={"query": query, "per_page": per_page, "orientation": "landscape"},
            headers={"Authorization": api_key},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("[media_engine] Pexels video API %d for query '%s'", resp.status_code, query)
            return []

        results = []
        for v in resp.json().get("videos", []):
            files = sorted(v.get("video_files", []), key=lambda x: x.get("width", 0), reverse=True)
            slug = v.get("url", "").split("/")[-2].replace("-", " ") if "url" in v else ""
            for f in files:
                if f.get("file_type") == "video/mp4" and f.get("width", 0) >= 1280:
                    results.append({
                        "url": f["link"],
                        "type": "video",
                        "width": f.get("width", 0),
                        "height": f.get("height", 0),
                        "source": "pexels",
                        "tags": slug
                    })
                    break
        return results
    except Exception as e:
        logger.warning("[media_engine] Pexels video error: %s", e)
        return []


def _search_pexels_images(query: str, per_page: int = 3) -> list[dict]:
    api_key = os.environ.get("PEXELS_API_KEY", "")
    if not api_key:
        return []

    try:
        resp = requests.get(
            "https://api.pexels.com/v1/search",
            params={"query": query, "per_page": per_page, "orientation": "landscape"},
            headers={"Authorization": api_key},
            timeout=15,
        )
        if resp.status_code != 200:
            return []

        return [
            {
                "url": p["src"].get("large2x", p["src"]["original"]),
                "type": "image",
                "width": p.get("width", 0),
                "height": p.get("height", 0),
                "source": "pexels",
                "tags": p.get("url", "").split("/")[-2].replace("-", " ") if "url" in p else ""
            }
            for p in resp.json().get("photos", [])
        ]
    except Exception as e:
        logger.warning("[media_engine] Pexels image error: %s", e)
        return []


# ── Pixabay fallback ─────────────────────────────────────────────────────────
def _search_pixabay_videos(query: str, per_page: int = 3) -> list[dict]:
    api_key = os.environ.get("PIXABAY_API_KEY", "")
    if not api_key:
        return []

    try:
        resp = requests.get(
            "https://pixabay.com/api/videos/",
            params={"key": api_key, "q": query, "per_page": per_page, "video_type": "film"},
            timeout=15,
        )
        if resp.status_code != 200:
            return []

        results = []
        for hit in resp.json().get("hits", []):
            videos = hit.get("videos", {})
            for quality in ("high", "medium", "small"):
                v = videos.get(quality, {})
                if v.get("url") and v.get("width", 0) >= 640:
                    results.append({
                        "url": v["url"],
                        "type": "video",
                        "width": v.get("width", 0),
                        "height": v.get("height", 0),
                        "source": "pixabay",
                        "tags": hit.get("tags", "")
                    })
                    break
        return results
    except Exception as e:
        logger.warning("[media_engine] Pixabay error: %s", e)
        return []


def _validate_and_score(item: dict, intent: dict, style: str = "viral", niche: str = "general") -> float:
    """Score media and apply hard rejection rules."""
    tags = item.get("tags", "").lower()
    width = item.get("width", 0)
    height = item.get("height", 0)
    
    # 🚨 HARD REJECTION RULES
    if width < 1280 and height < 720:
        return -1.0
        
    env = intent.get("environment", "").lower()
    subject = intent.get("subject", "").lower()
    mood = intent.get("mood", "").lower()
    shot_type = intent.get("shot_type", "").lower()
    
    # Reject indoor for outdoor
    if "outdoor" in env and any(x in tags for x in ["indoor", "room", "office", "inside"]):
        return -1.0
    # Reject day for night
    if "night" in env and any(x in tags for x in ["day", "sunlight", "sunny", "morning"]):
        return -1.0
    # Reject unrelated generic objects if we want a specific subject
    if "person" in subject and "people" not in tags and "man" not in tags and "woman" not in tags:
        # soft penalty, APIs aren't perfect
        pass
        
    # Phase 7: Anti-Stock Filter (Hard Rejection)
    anti_stock = ["corporate", "office", "meeting", "smiling", "businessman", "businesswoman"]
    if any(x in tags for x in anti_stock):
        return -1.0
        
    score = 0.0
    
    # 1. Keyword similarity (40%)
    subject_words = set(subject.split())
    tag_words = set(tags.split())
    overlap = len(subject_words.intersection(tag_words))
    score += min(40, overlap * 15)
    
    # 2. Context match (30%)
    if any(e in tags for e in env.split()):
        score += 30
    else:
        score += 15 # default partial

    # 3. Brightness match (10%)
    if "dark" in mood and any(x in tags for x in ["night", "dark", "black"]):
        score += 10
    elif "bright" in mood and any(x in tags for x in ["day", "bright", "sun"]):
        score += 10
    else:
        score += 5
        
    # 4. Motion / Shot relevance (20%)
    if shot_type and any(x in tags for x in shot_type.split()):
        score += 20
    else:
        score += 10
        
    # Phase 7: Viral Scoring Upgrade
    motion_tags = ["waves", "fire", "movement", "motion", "running", "flying"]
    contrast_tags = ["dark", "bright", "contrast", "shadow"]
    unique_tags = ["glow", "neon", "aerial", "macro", "drone", "cyberpunk"]
    
    if any(x in tags for x in motion_tags):
        score += 15
    if any(x in tags for x in contrast_tags):
        score += 10
    if any(x in tags for x in unique_tags):
        score += 15
        
    # Phase 15: Style Boosts
    if style == "mystery" and any(x in tags for x in ["dark", "fog", "shadow"]):
        score += 20
    elif style == "facts" and any(x in tags for x in ["bright", "clean", "white"]):
        score += 20
        
    # V2 Hybrid Reinforcement
    v2_score = is_clip_relevant(subject, item, 5.0)
    if v2_score < 0.55:
        logger.warning(f"[media_engine] Clip rejected by V2 Hybrid Scoring: {v2_score:.2f}")
        return -1.0
        
    return score


from schemas.pipeline import MediaRequest, MediaResponse

def fetch_best_media(
    request: MediaRequest
) -> Optional[str]:
    """
    Fetch the best matching media asset utilizing the Contextual Visual Engine.
    """
    visual_intent = request.visual_intent
    out_path = request.out_path
    prefer_video = request.prefer_video
    scene_index = request.scene_index
    style = request.style
    niche = request.niche

    if isinstance(visual_intent, list):
        # Fallback to legacy format
        intent_dict = {
            "subject": " ".join(visual_intent),
            "environment": "",
            "mood": "",
            "shot_type": ""
        }
    else:
        intent_dict = visual_intent.copy()
        
    # Phase 7: First Frame Dominance
    if scene_index == 1:
        intent_str = f"{intent_dict.get('subject', '')} {intent_dict.get('environment', '')} {intent_dict.get('mood', '')}".lower()
        if not any(x in intent_str for x in ["motion", "glow", "contrast", "dramatic", "striking", "action"]):
            # Phase 17: Niche-specific Hook Dominance
            hook_prefix = "dramatic cinematic high contrast"
            if niche == "mystery": hook_prefix = "spooky dark mysterious silhouette"
            elif niche == "finance": hook_prefix = "high-end luxury golden sleek"
            
            intent_dict['subject'] = f"{hook_prefix} {intent_dict.get('subject', '')}"
            logger.info("[media_engine] First Frame Dominance enforced (niche=%s) -> Query overridden: %s", niche, intent_dict['subject'])
            
    # Phase 7: Controlled Variety (1 wide, 1 close, 1 motion-based every 3 scenes)
    if scene_index % 3 == 1:
        intent_dict['shot_type'] = "wide shot"
    elif scene_index % 3 == 2:
        intent_dict['shot_type'] = "close-up"
    elif scene_index % 3 == 0:
        intent_dict['shot_type'] = "motion aerial dynamic"

    # Phase 30: Strict Query Logic (Primary = Subject ONLY)
    subject_raw = intent_dict.get('subject', '').strip()
    env_raw = intent_dict.get('environment', '').strip()
    base_keywords = _clean_keywords(f"{subject_raw} {env_raw}".split())

    queries = []
    for query in _build_queries(base_keywords):
        if query:
            queries.append(query)
    if subject_raw:
        queries.insert(0, subject_raw)
    if subject_raw and env_raw:
        queries.append(f"{subject_raw} {env_raw}".strip())
    if style == "mystery" and subject_raw:
        queries.append(f"{subject_raw} dark dramatic")
    elif subject_raw:
        queries.append(f"{subject_raw} cinematic dramatic lighting")

    deduped_queries = []
    seen_queries = set()
    for query in queries:
        cleaned_query = re.sub(r"\s+", " ", query).strip()
        if cleaned_query and cleaned_query not in seen_queries:
            seen_queries.add(cleaned_query)
            deduped_queries.append(cleaned_query)
    queries = deduped_queries

    all_results = []
    for query in queries:
        if not query: continue
        logger.info("[media_engine] Searching primary sources: '%s'", query)

        results = []
        if prefer_video:
            results = _search_pexels_videos(query, per_page=5)
            if not results:
                results = _search_pixabay_videos(query, per_page=5)
                
        if not results:
            results = _search_pexels_images(query, per_page=5)

        if results:
            all_results.extend(results)
            # If we collected enough, stop hitting APIs
            if len(all_results) >= 5:
                break
                
    # If top searches fail, Auto-Fallback Escalation
    if not all_results:
        esc_query = f"cinematic {intent_dict.get('subject', 'landscape')} dramatic lighting high quality"
        logger.warning("[media_engine] Escalating to auto-fallback query: '%s'", esc_query)
        all_results = _search_pexels_videos(esc_query, per_page=3)
        if not all_results:
             all_results = _search_pixabay_videos(esc_query, per_page=3)

    if not all_results:
        logger.warning("[media_engine] Primary and secondary sources failed. Generating local fallback asset.")
        return _generate_generic_asset(out_path)

    # Score and rank all collected results
    scored_results = []
    for r in all_results:
        score = _validate_and_score(r, intent_dict, style=style, niche=niche)
        if score >= 0: # Passed hard rejections
            r["_score"] = score
            scored_results.append(r)
            
    if not scored_results:
        logger.warning("[media_engine] All retrieved media failed hard rejection rules. Falling back.")
        esc_query = f"cinematic {intent_dict.get('subject', 'landscape')}"
        fallback_res = _search_pexels_videos(esc_query, per_page=1)
        if fallback_res:
            fallback_res[0]["_score"] = 100 # bypass
            scored_results = fallback_res
        else:
            return _generate_generic_asset(out_path)
            
    # Sort by score descending
    scored_results.sort(key=lambda x: x["_score"], reverse=True)
    
    # Try downloading the best ones in order
    for best in scored_results:
        ext = ".mp4" if best["type"] == "video" else ".jpg"
        cached = _download_url(best["url"], ext)
        if cached:
            import shutil
            final_out_path = _derive_output_path(out_path, best["type"])
            shutil.copy2(cached, final_out_path)
            logger.info("[media_engine] Media ready: %s (%s, score:%d, %dx%d, type=%s)",
                        os.path.basename(final_out_path), best["source"], best["_score"],
                        best.get("width", 0), best.get("height", 0))
            return final_out_path

    logger.warning("[media_engine] Failed to download any scored assets. Falling back to local asset.")
    return _generate_generic_asset(out_path)


def _generate_generic_asset(out_path: str) -> Optional[str]:
    """Generate a generic dark gradient image/video as last resort."""
    try:
        import subprocess
        from pathlib import Path

        fallback_path = str(Path(out_path).with_suffix(".jpg"))

        cmd = [
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=midnightblue:s=1920x1080",
            "-frames:v", "1", fallback_path
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=15)
        if r.returncode == 0 and os.path.exists(fallback_path):
            logger.info("[media_engine] Generated generic local asset at %s", fallback_path)
            return fallback_path
    except Exception as e:
        logger.error("[media_engine] Failed to generate generic asset: %s", e)

    return None


# ── Synonym expansion for visual queries ─────────────────────────────────────
VISUAL_SYNONYMS = {
    "ocean": ["sea", "underwater", "deep blue water"],
    "beach": ["shoreline", "tropical coast", "sandy shore"],
    "mountain": ["peaks", "alpine", "summit"],
    "fire": ["flames", "burning", "inferno"],
    "forest": ["jungle", "woodland", "rainforest"],
    "city": ["metropolis", "skyline", "downtown"],
    "night": ["darkness", "moonlight", "twilight"],
    "space": ["cosmos", "galaxy", "stars nebula"],
    "animal": ["wildlife", "creature", "fauna"],
    "technology": ["futuristic", "digital", "innovation"],
    "storm": ["thunder", "lightning", "hurricane"],
    "desert": ["sand dunes", "arid", "sahara"],
    "ice": ["glacier", "frozen", "arctic"],
    "volcano": ["eruption", "lava", "magma"],
}

CINEMATIC_MODIFIERS = [
    "cinematic", "dramatic lighting", "4k", "aerial view",
    "slow motion", "golden hour", "moody atmosphere",
]


def _build_queries(keywords: list[str]) -> list[str]:
    """Build progressively broader search queries with synonym expansion."""
    clean = _clean_keywords(keywords)

    if not clean:
        return ["cinematic nature landscape"]

    queries = []

    # Tier 1: Specific (top 3 clean keywords)
    if len(clean) >= 2:
        queries.append(" ".join(clean[:3]))

    # Tier 2: 2 keywords + cinematic modifier
    if len(clean) >= 2:
        queries.append(f"{clean[0]} {clean[1]} cinematic")

    # Tier 3: Single keyword
    queries.append(clean[0])

    # Tier 4: Synonym expansion (auto-expand with related terms)
    for kw in clean[:2]:
        if kw in VISUAL_SYNONYMS:
            for syn in VISUAL_SYNONYMS[kw][:1]:
                queries.append(f"{syn} dramatic lighting")

    # Tier 5: Keyword + cinematic modifier
    queries.append(f"{clean[0]} dramatic lighting")

    # Tier 6: Generic cinematic fallback
    queries.append("cinematic landscape nature")

    logger.info("[media_engine] Built queries from keywords %s → %s", keywords, queries)
    return queries
