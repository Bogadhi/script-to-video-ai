"""Unit tests for metadata_cleaner utility."""
import sys
sys.path.insert(0, ".")

from utils.metadata_cleaner import sanitize_metadata, build_description, normalize_subtitle_text

# ── Test 1: title truncation at word boundary ─────────────────────────────────
m = sanitize_metadata({
    "title": "This is a very long title that definitely exceeds sixty characters in length",
    "description": "hello\nhello\nworld\nhello",
    "tags": ["Alpha", "alpha", "BETA", "gamma", "alpha"],
})
assert len(m["title"]) <= 60, f"title too long: {len(m['title'])}"
assert m["title"].endswith("..."), f"no ellipsis: {m['title']}"
print(f"PASS title truncation: {m['title']!r}")

# ── Test 2: description deduplication ────────────────────────────────────────
assert m["description"].count("hello") == 1, f"dedup failed: {m['description']!r}"
assert "world" in m["description"], "world line was removed"
print("PASS description dedup")

# ── Test 3: tags dedup + lowercase ───────────────────────────────────────────
assert len([t for t in m["tags"] if t == "alpha"]) == 1, f"alpha duplicated: {m['tags']}"
assert all(t == t.lower() for t in m["tags"]), f"tags not lowercase: {m['tags']}"
print(f"PASS tags: {m['tags']}")

# ── Test 4: build_description doesn't repeat first sentence ─────────────────
desc = build_description(
    "Amazing Hook Title",
    "Amazing Hook Title sentence. Second sentence here. Third sentence follows.",
    "facts",
    ["space", "nature"],
)
count = desc.count("Amazing Hook Title sentence")
assert count == 1, f"first sentence appeared {count} times in:\n{desc}"
print("PASS no description duplication")

# ── Test 5: subtitle unicode normalization ────────────────────────────────────
t = normalize_subtitle_text("It\u2019s a test \u2014 with \u201csmart\u201d quotes\u2026")
assert "'" in t, "apostrophe not normalized"
assert '"' in t, "quote not normalized"
assert " - " in t, "em dash not normalized"
assert "..." in t, "ellipsis not normalized"
assert "\u2019" not in t, "curly apostrophe not removed"
assert "\u2014" not in t, "em dash not removed"
assert "\u201c" not in t, "smart quote not removed"
print(f"PASS unicode normalization: {t!r}")

print("\nALL TESTS PASSED ✅")
