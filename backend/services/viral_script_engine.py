import random

print("🔥 VIRAL SCRIPT ENGINE LOADED")


HOOKS = [
    "This might be the most unbelievable {topic} ever discovered.",
    "You won’t believe what happens at this {topic}.",
    "This {topic} is not what it looks like...",
    "Something strange is happening with {topic}.",
    "This place looks normal… until night falls."
]

CURIOSITY = [
    "At first glance, it seems ordinary.",
    "But there’s something hidden beneath the surface.",
    "Scientists were shocked when they discovered this.",
]

REVEALS = [
    "The secret lies in bioluminescence.",
    "Tiny organisms emit light when disturbed.",
    "It’s a natural chemical reaction that creates this glow.",
]

TWISTS = [
    "But it only happens under perfect conditions.",
    "And not every beach can do this.",
    "Even scientists don’t fully understand it yet.",
]

CTA = [
    "Follow for more unbelievable places.",
    "Subscribe to discover hidden wonders.",
    "Watch more to explore the unknown."
]


def generate_viral_script(topic: str):
    hook = random.choice(HOOKS).format(topic=topic)
    curiosity = random.choice(CURIOSITY)
    reveal = random.choice(REVEALS)
    twist = random.choice(TWISTS)
    cta = random.choice(CTA)

    scenes = [
        {"scene_id": 1, "narration": hook},
        {"scene_id": 2, "narration": curiosity},
        {"scene_id": 3, "narration": reveal},
        {"scene_id": 4, "narration": twist},
        {"scene_id": 5, "narration": cta},
    ]

    return scenes