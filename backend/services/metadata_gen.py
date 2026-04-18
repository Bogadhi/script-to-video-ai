import json
import os


def generate_metadata(script: str, scenes: list, topic_anchor: str):
    base = script.split(".")[0][:60]

    title = f"{base.strip()} 😳"

    description = f"""
{script}

🔥 Watch till the end!
📌 Subscribe for more amazing videos!
"""

    tags = list(set(
        ["facts", "viral", "trending"] +
        [w for s in scenes for w in s.get("keywords", [])]
    ))[:15]

    return {
        "title": title,
        "description": description,
        "tags": tags
    }


def save_metadata(metadata: dict, project_dir: str):
    path = os.path.join(project_dir, "metadata", "youtube.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w") as f:
        json.dump(metadata, f, indent=2)

    print("[Metadata] Saved:", path)
    return path