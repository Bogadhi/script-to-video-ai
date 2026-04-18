"""
Celery application singleton.

Windows compatibility:
  - worker_pool = "solo"  avoids multiprocessing fork issues on Windows
  - Set REDIS_URL env var to override broker (default: redis://localhost:6379/0)

Start worker (from backend/ dir):
    celery -A workers.celery_app worker --pool=solo --loglevel=info
"""

import os
from celery import Celery

_BROKER = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
_BACKEND = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "scripttovideo",
    broker=_BROKER,
    backend=_BACKEND,
    include=["workers.pipeline_worker"],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # ✅ Windows / solo-pool compatibility — avoids multiprocessing crashes
    worker_pool="solo",

    # Prevent worker from prefetching more than 1 task at a time
    worker_prefetch_multiplier=1,
)
