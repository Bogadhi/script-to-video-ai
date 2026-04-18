def classify_scene_emotion(narration: str) -> str:
    text = narration.lower()

    if any(w in text for w in ["danger", "warning", "shocked", "terror"]):
        return "dramatic"

    if any(w in text for w in ["dream", "success", "achieve", "incredible"]):
        return "inspirational"

    if any(w in text for w in ["how", "why", "secret", "hidden"]):
        return "curiosity"

    return "educational"