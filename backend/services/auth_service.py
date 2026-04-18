"""
Auth Service
============
Production-grade authentication with:
- Per-user salt + pbkdf2_hmac password hashing
- JWT tokens with 24-hour expiry (HS256)
- SQLite user storage (same DB as credits)

No external bcrypt dependency required.
"""

import os
import hashlib
import sqlite3
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ── JWT via PyJWT ────────────────────────────────────────────────────────────
try:
    import jwt as pyjwt
except ImportError:
    pyjwt = None
    logger.error("[auth] PyJWT not installed. Run: pip install PyJWT")

# ── Config ────────────────────────────────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET", "s2v-secret-change-in-production-2024")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "video_automation.db")

PBKDF2_ITERATIONS = 100_000


# ── DB Setup ──────────────────────────────────────────────────────────────────
def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db() -> None:
    """Create users table if it doesn't exist."""
    with _get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            password_hash BLOB NOT NULL,
            password_salt BLOB NOT NULL,
            plan TEXT DEFAULT 'free',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)


# ── Password Hashing ─────────────────────────────────────────────────────────
def _hash_password(password: str, salt: Optional[bytes] = None) -> tuple[bytes, bytes]:
    """
    Hash password with per-user random salt using pbkdf2_hmac.
    Returns (hash, salt).
    """
    if salt is None:
        salt = os.urandom(16)
    pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return pw_hash, salt


def _verify_password(password: str, stored_hash: bytes, stored_salt: bytes) -> bool:
    """Verify a password against stored hash + salt."""
    computed_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), stored_salt, PBKDF2_ITERATIONS)
    return computed_hash == stored_hash


# ── JWT ───────────────────────────────────────────────────────────────────────
def _create_token(user_id: str, email: str, username: str) -> str:
    """Create a JWT with 24h expiry."""
    if pyjwt is None:
        raise RuntimeError("PyJWT is not installed")

    payload = {
        "user_id": user_id,
        "email": email,
        "username": username,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT token.
    Returns the payload dict or None if invalid/expired.
    """
    if pyjwt is None:
        return None
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except pyjwt.ExpiredSignatureError:
        logger.warning("[auth] Token expired")
        return None
    except pyjwt.InvalidTokenError as e:
        logger.warning("[auth] Invalid token: %s", e)
        return None


# ── Public API ────────────────────────────────────────────────────────────────
def register_user(username: str, password: str) -> dict:
    """
    Register a new user.
    Returns { success, token, user } or { success: False, reason }.
    """
    init_auth_db()

    username = username.strip().lower()
    email = username

    # Validation
    if not email or "@" not in email:
        return {"success": False, "reason": "Invalid email address"}
    if not password or len(password) < 6:
        return {"success": False, "reason": "Password must be at least 6 characters"}

    pw_hash, pw_salt = _hash_password(password)
    user_id = hashlib.sha256(f"{email}-{time.time_ns()}".encode()).hexdigest()[:16]

    try:
        with _get_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, email, username, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)",
                (user_id, email, username, pw_hash, pw_salt),
            )
    except sqlite3.IntegrityError:
        return {"success": False, "reason": "Email already registered"}

    token = _create_token(user_id, email, username)
    logger.info("[auth] User registered: %s (%s)", username, email)

    return {
        "success": True,
        "token": token,
        "user": {"id": user_id, "email": email, "username": username, "plan": "free"},
    }


def authenticate_user(username: str, password: str) -> dict:
    """
    Authenticate a user by username + password.
    Returns { success, token, user } or { success: False, reason }.
    """
    init_auth_db()

    username = username.strip().lower()

    with _get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()

    if not row:
        return {"success": False, "reason": "Invalid email or password"}

    if not _verify_password(password, row["password_hash"], row["password_salt"]):
        return {"success": False, "reason": "Invalid email or password"}

    token = _create_token(row["id"], row["email"], row["username"])
    logger.info("[auth] User logged in: %s", username)

    return {
        "success": True,
        "token": token,
        "user": {
            "id": row["id"],
            "email": row["email"],
            "username": row["username"],
            "plan": row["plan"],
        },
    }


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Fetch user by ID."""
    init_auth_db()
    with _get_conn() as conn:
        row = conn.execute("SELECT id, email, username, plan, created_at FROM users WHERE id=?", (user_id,)).fetchone()
    if row:
        return dict(row)
    return None
