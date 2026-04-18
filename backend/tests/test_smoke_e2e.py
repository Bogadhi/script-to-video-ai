"""
Smoke test: end-to-end pipeline check.

Submits a minimal script via HTTP, polls status until complete or timeout,
and asserts all artifacts are present.

Run (from backend/ dir with venv activated and server + Celery running):
    python -m pytest tests/test_smoke_e2e.py -v -s
"""

import os
import time
import requests
import pytest

BASE_URL = os.environ.get("API_URL", "http://127.0.0.1:8000")
TIMEOUT  = int(os.environ.get("SMOKE_TIMEOUT", "180"))  # seconds

TEST_SCRIPT = """Did you know the Great Wall of China is not actually visible from space?
Despite the popular myth, astronauts confirm it is too narrow to see with the naked eye.
The wall stretches over 13,000 miles and took more than 1,000 years to build."""


def test_health():
    """Backend must be reachable."""
    resp = requests.get(f"{BASE_URL}/health", timeout=5)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_create_project():
    """POST /api/scripts/create must return a project_id."""
    resp = requests.post(
        f"{BASE_URL}/api/scripts/create",
        data={"script_text": TEST_SCRIPT, "video_category": "education"},
        timeout=10,
    )
    assert resp.status_code == 200, f"Create failed: {resp.text}"
    data = resp.json()
    assert "project_id" in data
    assert data["project_id"]  # non-empty


def test_full_pipeline_e2e():
    """Submit script → poll → assert complete with all artifacts."""
    # Create project
    resp = requests.post(
        f"{BASE_URL}/api/scripts/create",
        data={"script_text": TEST_SCRIPT, "video_category": "education"},
        timeout=10,
    )
    assert resp.status_code == 200, f"Create failed: {resp.text}"
    project_id = resp.json()["project_id"]
    print(f"\nProject ID: {project_id}")

    # Poll status
    deadline = time.time() + TIMEOUT
    last_status = None
    while time.time() < deadline:
        status_resp = requests.get(f"{BASE_URL}/api/pipeline/{project_id}/status", timeout=5)
        assert status_resp.status_code == 200
        data = status_resp.json()
        last_status = data["overall_status"]
        print(f"  Status: {last_status} | Steps: {[(s['name'], s['status']) for s in data['steps'] if s['status'] != 'pending']}")

        if last_status == "complete":
            break
        if last_status == "error":
            pytest.fail(f"Pipeline error: {data.get('error')}")

        time.sleep(3)

    assert last_status == "complete", f"Pipeline did not complete within {TIMEOUT}s. Last status: {last_status}"

    # Verify artifacts in response
    artifacts = data["artifacts"]
    assert artifacts["final_video"]  is not None, "final_video artifact missing"
    assert artifacts["thumbnail"]    is not None, "thumbnail artifact missing"
    assert artifacts["subtitles"]    is not None, "subtitles artifact missing"
    assert artifacts["metadata"]     is not None, "metadata artifact missing"

    # Verify artifact URLs are browser-safe (no backslashes, no OS absolute paths)
    for key, url in artifacts.items():
        if url:
            assert "\\" not in url,          f"{key} URL contains backslash: {url}"
            assert not url.startswith("C:"), f"{key} URL is an OS path: {url}"
            assert url.startswith("/projects/"), f"{key} URL has wrong prefix: {url}"

    # Verify files accessible via HTTP
    for key, url in artifacts.items():
        if url:
            file_resp = requests.head(f"{BASE_URL}{url}", timeout=5)
            assert file_resp.status_code == 200, f"{key} not accessible at {BASE_URL}{url}"

    # Verify metadata endpoint
    meta_resp = requests.get(f"{BASE_URL}/api/pipeline/{project_id}/metadata", timeout=5)
    assert meta_resp.status_code == 200, "Metadata endpoint failed"
    meta = meta_resp.json()
    assert "title" in meta
    assert "description" in meta
    assert "tags" in meta
    assert len(meta["title"]) <= 60, f"Title too long: {meta['title']}"

    print(f"\n✅ E2E smoke test PASSED for project {project_id}")
    print(f"   Video:    {BASE_URL}{artifacts['final_video']}")
    print(f"   Thumb:    {BASE_URL}{artifacts['thumbnail']}")
    print(f"   Title:    {meta['title']}")
