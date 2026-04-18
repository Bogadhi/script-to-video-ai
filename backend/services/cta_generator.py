CTA_TEMPLATES = {
    "facts": "Like and subscribe for more amazing facts!",
    "mystery": "What do you think? Comment below!",
    "travel": "Which place would you visit next?",
    "technology": "Follow for more tech insights!",
    "education": "Keep learning with us!",
    "motivation": "You can do it — start today!",
    "finance": "Grow your money smartly — subscribe!"
}

def generate_cta(category: str) -> str:
    return CTA_TEMPLATES.get(category.lower(), CTA_TEMPLATES["facts"])