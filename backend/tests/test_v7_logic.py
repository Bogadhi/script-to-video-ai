import os
import sys
import json

# Ensure services are in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.metadata_gen import generate_metadata
from services.subtitle_gen import _format_srt_time

def test_v7_seo_metadata():
    print("--- Testing Phase 11: SEO Metadata ---")
    script = "Have you ever seen the glowing beaches of Vaadhoo Island in the Maldives? It's a mystery of nature."
    anchor = "bioluminescent ocean maldives"
    
    metadata = generate_metadata(script, [], topic_anchor=anchor)
    print(f"Generated Title: {metadata['title']}")
    
    # Expected: "the glowing beaches of Vaadhoo Island in th... (Bioluminescent Ocean Maldives)"
    # Or similar, but following Hook (Anchor) pattern
    assert "(" in metadata['title']
    assert len(metadata['title']) <= 70
    print("SEO Title Test Passed")

def test_v7_subtitle_timing():
    print("\n--- Testing Phase 11: Subtitle Timing ---")
    # Simulate a 10.5 second audio duration
    start = 0.0
    duration = 10.5
    end = start + duration
    
    start_str = _format_srt_time(start)
    end_str = _format_srt_time(end)
    
    print(f"SRT Segment: {start_str} --> {end_str}")
    # Verify no extra buffer in timestamp
    assert end_str == "00:00:10,500"
    print("Subtitle Timing Test Passed")

if __name__ == "__main__":
    test_v7_seo_metadata()
    test_v7_subtitle_timing()
