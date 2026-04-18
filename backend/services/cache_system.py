"""
Result Caching System
=====================
In-memory LRU cache for content packages (script, scenes, SEO, thumbnail text).
Topic-hash keyed. Avoids repeated Gemini calls for the same input.

Cache capacity: configurable via CACHE_MAX_ENTRIES env var (default 500).
TTL: configurable via CACHE_TTL_HOURS env var (default 24h).
"""

import os
import time
import hashlib
import threading
import logging
from collections import OrderedDict
from typing import Optional

logger = logging.getLogger(__name__)

CACHE_TTL_SEC   = int(os.environ.get("CACHE_TTL_HOURS", "24")) * 3600
CACHE_MAX       = int(os.environ.get("CACHE_MAX_ENTRIES", "500"))

_lock = threading.Lock()

# OrderedDict as LRU: most-recently used → end
_cache: OrderedDict[str, dict] = OrderedDict()   # key → { value, expires_at }


def _make_key(topic: str, category: str) -> str:
    import re
    # Strip all non-alphanumeric characters for key consistency
    clean_topic = re.sub(r'[\W_]+', '', topic).lower()
    clean_category = re.sub(r'[\W_]+', '', category).lower()
    canonical = f"{clean_topic}|{clean_category}"
    import hashlib
    return hashlib.sha1(canonical.encode()).hexdigest()[:12]


def get_cached_package(topic: str, category: str) -> Optional[dict]:
    """
    Retrieve a cached content package if available and not expired.

    Returns the package dict, or None on cache miss.
    """
    key = _make_key(topic, category)
    with _lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry["expires_at"]:
            del _cache[key]
            logger.debug("[cache] Expired: %s", key)
            return None
        # Move to end (LRU)
        _cache.move_to_end(key)
        logger.info("[cache] HIT for key %s (topic=%s)", key, topic[:40])
        return entry["value"]


def set_cached_package(topic: str, category: str, package: dict) -> None:
    """
    Store a content package in the cache.
    Evicts oldest entry if capacity exceeded.
    """
    key = _make_key(topic, category)
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
        _cache[key] = {
            "value": package,
            "expires_at": time.monotonic() + CACHE_TTL_SEC,
        }
        # Evict oldest if over capacity
        while len(_cache) > CACHE_MAX:
            evicted = _cache.popitem(last=False)
            logger.debug("[cache] Evicted oldest entry: %s", evicted[0])
        logger.info("[cache] SET key %s (cache size=%d)", key, len(_cache))


def invalidate(topic: str, category: str) -> bool:
    """Remove a specific entry from the cache."""
    key = _make_key(topic, category)
    with _lock:
        if key in _cache:
            del _cache[key]
            return True
        return False


def clear_cache() -> int:
    """Clear entire cache. Returns number of entries evicted."""
    with _lock:
        count = len(_cache)
        _cache.clear()
        logger.info("[cache] Cleared %d entries", count)
        return count


def get_cache_stats() -> dict:
    """Return current cache statistics."""
    with _lock:
        now = time.monotonic()
        active = sum(1 for e in _cache.values() if e["expires_at"] > now)
        return {
            "total_entries": len(_cache),
            "active_entries": active,
            "expired_entries": len(_cache) - active,
            "max_capacity": CACHE_MAX,
            "ttl_hours": CACHE_TTL_SEC / 3600,
        }
