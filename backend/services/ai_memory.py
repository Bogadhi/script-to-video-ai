import os
import sqlite3
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "memory", "ai_knowledge.db")

def _init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS visual_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scene_text TEXT,
                prompt TEXT,
                style TEXT,
                clip_score REAL,
                embedding TEXT,
                usage_count INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

_init_db()

def fetch_top_styles(min_score: float = 0.7, limit: int = 3) -> List[str]:
    """Retrieve highly successful generated styles to blend natively."""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute(
                "SELECT style FROM visual_memory WHERE clip_score > ? ORDER BY clip_score DESC, usage_count DESC LIMIT ?",
                (min_score, limit)
            )
            rows = cursor.fetchall()
            return [row[0] for row in rows]
    except Exception as e:
        logger.error(f"[ai_memory] Failed to fetch top styles: {e}")
        return []

def store_visual_success(scene_text: str, prompt: str, style: str, clip_score: float, embedding: List[float] = None):
    """Archival function saving highly rated inference matrices."""
    try:
        if clip_score > 0.75:
            import json
            emb_str = json.dumps(embedding) if embedding else None
            
            with sqlite3.connect(DB_PATH) as conn:
                # Check if prompt exists to upvote
                cursor = conn.execute("SELECT id FROM visual_memory WHERE prompt = ?", (prompt,))
                row = cursor.fetchone()
                if row:
                    conn.execute("UPDATE visual_memory SET usage_count = usage_count + 1, clip_score = max(clip_score, ?), embedding = ? WHERE id = ?", (clip_score, emb_str, row[0]))
                else:
                    conn.execute(
                        "INSERT INTO visual_memory (scene_text, prompt, style, clip_score, embedding) VALUES (?, ?, ?, ?, ?)",
                        (scene_text, prompt, style, clip_score, emb_str)
                    )
                conn.commit()
    except Exception as e:
        logger.error(f"[ai_memory] Failed to store memory: {e}")
