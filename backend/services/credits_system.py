"""
Credits System
==============
User-based SQLite-backed usage enforcement:
- 3 videos per day per authenticated user (free plan)
- Coupon system to activate premium plans
- Atomic transactions to prevent race conditions
- Idempotent deduction via project_id ledger

Credits are tied to authenticated user IDs, NOT IP addresses.
"""

import os
import logging
import sqlite3
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "video_automation.db")

PLANS = {
    "free": {"daily_limit": 3, "requires_coupon": True},
    "starter": {"daily_limit": 10, "requires_coupon": False},
    "pro": {"daily_limit": 30, "requires_coupon": False},
    "premium": {"daily_limit": -1, "requires_coupon": False},  # -1 = unlimited
}

COUPONS = {
    "FREETRIAL": "free",
    "BETA2024": "starter",
    "PROLAUNCH": "pro"
}


# ── DB Setup ──────────────────────────────────────────────────────────────────
def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # Better concurrency
    return conn


def init_db() -> None:
    """Initialize credits tables if they don't exist."""
    with _get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS user_credits (
            user_id TEXT PRIMARY KEY,
            plan TEXT DEFAULT 'free',
            coupon_used TEXT,
            daily_count INTEGER DEFAULT 0,
            last_reset_date TEXT,
            total_generated INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS coupon_usage (
            coupon TEXT,
            user_id TEXT,
            used_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (coupon, user_id)
        );

        CREATE TABLE IF NOT EXISTS credit_ledger (
            project_id TEXT PRIMARY KEY,
            user_id TEXT,
            deducted_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)


def _reset_if_new_day(conn: sqlite3.Connection, user_id: str, row: dict) -> dict:
    """Reset daily count if it's a new day. Must be called inside a transaction."""
    today = str(date.today())
    if row["last_reset_date"] != today:
        conn.execute(
            "UPDATE user_credits SET daily_count=0, last_reset_date=? WHERE user_id=?",
            (today, user_id),
        )
        row = dict(row)
        row["daily_count"] = 0
        row["last_reset_date"] = today
    return row


def _get_or_create_user(conn: sqlite3.Connection, user_id: str) -> dict:
    """Get or create a credits record for a user. Must be called inside a transaction."""
    today = str(date.today())
    row = conn.execute("SELECT * FROM user_credits WHERE user_id=?", (user_id,)).fetchone()

    if not row:
        conn.execute(
            "INSERT INTO user_credits (user_id, last_reset_date) VALUES (?, ?)",
            (user_id, today),
        )
        row = conn.execute("SELECT * FROM user_credits WHERE user_id=?", (user_id,)).fetchone()

    return dict(row)


# ── Public API ────────────────────────────────────────────────────────────────
def check_can_generate(user_id: str, coupon: Optional[str] = None) -> dict:
    """
    Check if this user can generate a video.
    ATOMIC: runs inside a single transaction to prevent race conditions.

    Returns:
        {
            allowed: bool,
            reason: str,
            daily_remaining: int,
            plan: str,
        }
    """
    init_db()

    with _get_conn() as conn:
        user = _get_or_create_user(conn, user_id)
        user = _reset_if_new_day(conn, user_id, user)

        plan_name = user.get("plan", "free")
        plan = PLANS.get(plan_name, PLANS["free"])

        # Apply coupon if provided
        if coupon and coupon.upper() in COUPONS:
            coupon_plan_name = COUPONS[coupon.upper()]
            coupon_plan = PLANS.get(coupon_plan_name, PLANS["free"])
            if coupon_plan.get("daily_limit", 0) > (plan.get("daily_limit", 0) or 0):
                plan = coupon_plan
                plan_name = coupon_plan_name

        daily_limit = plan["daily_limit"]
        daily_count = user.get("daily_count", 0)

        if daily_limit == -1:
            return {
                "allowed": True,
                "reason": "Unlimited plan",
                "daily_remaining": 9999,
                "plan": plan_name,
            }

        if daily_count >= daily_limit:
            return {
                "allowed": False,
                "reason": f"Daily limit reached ({daily_limit}/day). Upgrade your plan.",
                "daily_remaining": 0,
                "plan": plan_name,
            }

        return {
            "allowed": True,
            "reason": "OK",
            "daily_remaining": daily_limit - daily_count,
            "plan": plan_name,
        }


def consume_credit(user_id: str, project_id: Optional[str] = None) -> bool:
    """
    Atomically increment daily usage counter for a user.
    Idempotent: if project_id is provided, ensures it's only deducted once.
    ATOMIC: entire check+insert runs in a single transaction.

    Returns True if deducted, False if already deducted.
    """
    init_db()
    today = str(date.today())

    conn = _get_conn()
    try:
        # BEGIN IMMEDIATE locks the DB for writes — prevents race conditions
        conn.execute("BEGIN IMMEDIATE")

        if project_id:
            exists = conn.execute(
                "SELECT 1 FROM credit_ledger WHERE project_id=?", (project_id,)
            ).fetchone()
            if exists:
                conn.execute("COMMIT")
                logger.debug("[credits] Project %s already deducted", project_id)
                return False

            conn.execute(
                "INSERT INTO credit_ledger (project_id, user_id) VALUES (?, ?)",
                (project_id, user_id),
            )

        # Atomic check: verify limit BEFORE incrementing
        user = _get_or_create_user(conn, user_id)
        user = _reset_if_new_day(conn, user_id, user)

        plan_name = user.get("plan", "free")
        plan = PLANS.get(plan_name, PLANS["free"])
        daily_limit = plan["daily_limit"]
        daily_count = user.get("daily_count", 0)

        if daily_limit != -1 and daily_count >= daily_limit:
            conn.execute("ROLLBACK")
            logger.warning("[credits] User %s over daily limit, rejecting", user_id)
            return False

        # Upsert usage
        conn.execute("""
        INSERT INTO user_credits (user_id, daily_count, total_generated, last_reset_date)
        VALUES (?, 1, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            daily_count = daily_count + 1,
            total_generated = total_generated + 1,
            last_reset_date = excluded.last_reset_date
        """, (user_id, today))

        conn.execute("COMMIT")
        return True
    except Exception as e:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        logger.error("[credits] Transaction error: %s", e)
        raise
    finally:
        conn.close()


def redeem_coupon(user_id: str, coupon: str) -> dict:
    """Attempt to redeem a coupon for the user."""
    init_db()
    code = coupon.strip().upper()

    if code not in COUPONS:
        return {"success": False, "message": "Invalid coupon"}

    new_plan = COUPONS[code]

    with _get_conn() as conn:
        # Ensure user record exists
        _get_or_create_user(conn, user_id)

        existing = conn.execute(
            "SELECT * FROM coupon_usage WHERE coupon=? AND user_id=?",
            (code, user_id),
        ).fetchone()
        if existing:
            return {"success": False, "message": "Coupon already redeemed"}

        conn.execute(
            "INSERT INTO coupon_usage (coupon, user_id) VALUES (?, ?)",
            (code, user_id),
        )
        conn.execute(
            "UPDATE user_credits SET plan=?, coupon_used=? WHERE user_id=?",
            (new_plan, code, user_id),
        )

    logger.info("[credits] User %s redeemed coupon %s → plan %s", user_id, code, new_plan)
    return {"success": True, "plan": new_plan, "message": "Coupon applied"}


def get_user_info(user_id: str) -> dict:
    """Return current user plan + usage stats."""
    init_db()

    with _get_conn() as conn:
        user = _get_or_create_user(conn, user_id)
        user = _reset_if_new_day(conn, user_id, user)

    plan_name = user.get("plan", "free")
    plan = PLANS.get(plan_name, PLANS["free"])
    daily_limit = plan["daily_limit"]

    return {
        "plan": plan_name,
        "daily_used": user.get("daily_count", 0),
        "daily_limit": daily_limit if daily_limit != -1 else "unlimited",
        "total_generated": user.get("total_generated", 0),
    }
