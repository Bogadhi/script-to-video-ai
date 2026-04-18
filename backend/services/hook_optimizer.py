import re

def optimize_hook(script: str) -> str:
    sentences = script.split('.')

    if not sentences:
        return script

    first = sentences[0].strip()

    patterns = ["Did you know", "Ever wondered", "Have you ever", "Imagine"]

    has_hook = any(p.lower() in first.lower() for p in patterns)

    if not has_hook and len(first) > 10:
        first = f"Did you know that {first.lower()}"

    sentences[0] = first

    optimized = '. '.join(sentences)

    print(f"[Hook Optimizer] {first}")
    return optimized