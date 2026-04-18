import re
from sentence_transformers import SentenceTransformer

# Load model once
model = SentenceTransformer("all-MiniLM-L6-v2")

print("🔥 LOCAL AI SCENE ANALYZER LOADED")


def split_into_sentences(text):
    sentences = re.split(r'[.!?]+', text)
    return [s.strip() for s in sentences if s.strip()]


def enhance_query(sentence, video_category=None):
    sentence = sentence.lower()

    stopwords = [
        "the", "is", "are", "was", "were", "have", "has",
        "had", "this", "that", "these", "those", "you",
        "your", "ever", "heard", "about", "into", "it’s", "its"
    ]

    words = [w for w in sentence.split() if w not in stopwords]

    keywords = words[:6]

    query = " ".join(keywords)

    if video_category:
        query += f" {video_category}"

    return query + " cinematic footage"


def analyze_script(script, video_category=None, **kwargs):
    """
    Compatible with pipeline_worker
    """

    sentences = split_into_sentences(script)

    scenes = []

    for i, sentence in enumerate(sentences):
        query = enhance_query(sentence, video_category)

        embedding = model.encode(sentence).tolist()

        scenes.append({
            "scene_id": i + 1,
            "narration": sentence,   # ✅ FIXED HERE
            "text": sentence,        # (optional, keep both)
            "search_query": query,
            "embedding": embedding
        })

        print(f"[Scene {i+1}] → {query}")

    topic_anchor = sentences[0] if sentences else "video"

    return topic_anchor, scenes