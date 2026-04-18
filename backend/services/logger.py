"""
Structured Pipeline Logger
===========================
Consistent, step-level JSON-structured logging for all pipeline steps.
Tracks: request_id, step_name, success/failure, execution_time_ms.

Usage:
    from services.logger import PipelineLogger
    log = PipelineLogger(project_id="abc-123")
    with log.step("gemini"):
        result = generate_content_package(...)
"""

import logging
import time
import traceback
from contextlib import contextmanager
from typing import Optional

# Use Python's stdlib logger — compatible with all logging configs
_base = logging.getLogger("pipeline")


def _fmt(project_id: str, step: str, status: str, elapsed_ms: float, msg: str = "") -> str:
    parts = [
        f"[PIPELINE] project={project_id[:8]}",
        f"step={step}",
        f"status={status}",
        f"elapsed={elapsed_ms:.0f}ms",
    ]
    if msg:
        parts.append(f"detail={msg!r}")
    return " | ".join(parts)


class PipelineLogger:
    """
    Attaches to a single pipeline run and provides structured step logging.
    """

    def __init__(self, project_id: str, extra: Optional[dict] = None):
        self.project_id = project_id
        self.extra = extra or {}
        self.start_time = time.monotonic()
        self._step_times: dict[str, float] = {}
        _base.info("[PIPELINE] START project=%s", project_id)

    @contextmanager
    def step(self, name: str):
        """
        Context manager that logs a step with timing and success/failure.

        Usage:
            with log.step("media_fetch"):
                do_work()
        """
        t0 = time.monotonic()
        _base.info(_fmt(self.project_id, name, "START", 0))
        try:
            yield
            elapsed = (time.monotonic() - t0) * 1000
            self._step_times[name] = elapsed
            _base.info(_fmt(self.project_id, name, "SUCCESS", elapsed))
        except Exception as exc:
            elapsed = (time.monotonic() - t0) * 1000
            self._step_times[name] = elapsed
            _base.error(
                _fmt(self.project_id, name, "FAILURE", elapsed, str(exc)[:200])
            )
            raise  # Re-raise so pipeline handles it

    def warn(self, step: str, message: str) -> None:
        _base.warning(_fmt(self.project_id, step, "WARN", 0, message))

    def info(self, step: str, message: str) -> None:
        _base.info(_fmt(self.project_id, step, "INFO", 0, message))

    def done(self) -> None:
        total_ms = (time.monotonic() - self.start_time) * 1000
        _base.info(
            "[PIPELINE] COMPLETE project=%s | total=%.0fms | steps=%s",
            self.project_id,
            total_ms,
            list(self._step_times.keys()),
        )

    def failed(self, exc: Exception) -> None:
        total_ms = (time.monotonic() - self.start_time) * 1000
        _base.error(
            "[PIPELINE] FAILED project=%s | total=%.0fms | error=%s",
            self.project_id,
            total_ms,
            str(exc)[:300],
        )

    def get_timing_report(self) -> dict:
        return {
            "project_id": self.project_id,
            "total_ms": round((time.monotonic() - self.start_time) * 1000),
            "steps": {k: round(v) for k, v in self._step_times.items()},
        }
