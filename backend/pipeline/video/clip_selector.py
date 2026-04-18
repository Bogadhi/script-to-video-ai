import random
from sentence_transformers import SentenceTransformer, util

print("🔥 AI CLIP SELECTOR (LOCAL) LOADED")

model = SentenceTransformer("all-MiniLM-L6-v2")


def select_best_clips(clips, scene_text=None, top_k=2):
    """
    Select best clips using semantic similarity
    """

    if not clips:
        return []

    # Fallback if no scene_text
    if not scene_text:
        return random.sample(clips, min(top_k, len(clips)))

    try:
        # Encode scene
        scene_embedding = model.encode(scene_text, convert_to_tensor=True)

        scored_clips = []

        for clip in clips:
            text = clip.get("title") or clip.get("url") or "video clip"
            clip_embedding = model.encode(text, convert_to_tensor=True)

            score = util.cos_sim(scene_embedding, clip_embedding).item()

            scored_clips.append((clip, score))

        # Sort by similarity
        scored_clips.sort(key=lambda x: x[1], reverse=True)

        selected = [clip for clip, _ in scored_clips[:top_k]]

        print(f"[Clip Selector] Selected {len(selected)} clips")
        return selected

    except Exception as e:
        print("[Clip Selector] ⚠ Fallback random selection:", e)
        return random.sample(clips, min(top_k, len(clips)))