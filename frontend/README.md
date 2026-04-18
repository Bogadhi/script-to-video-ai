# ScriptToVideo AI Pipeline — Phase 1

## Directory structure

```
project/
├── backend/
│   ├── api.py                   ← FastAPI entry point
│   ├── requirements.txt
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── scripts.py           ← POST /api/scripts/create
│   │   └── pipeline.py          ← GET  /api/pipeline/{id}/status
│   ├── workers/
│   │   ├── __init__.py
│   │   ├── celery_app.py        ← Celery singleton
│   │   └── pipeline_worker.py   ← Full pipeline task
│   ├── utils/
│   │   ├── __init__.py
│   │   └── status.py            ← status.json read/write helpers
│   └── projects/                ← auto-created at runtime
│       └── <project_id>/
│           ├── script.txt
│           ├── config.json
│           ├── status.json      ← live pipeline status
│           ├── final.mp4
│           ├── thumbnail.jpg
│           ├── subtitles.srt
│           ├── music.aac
│           ├── scenes/
│           │   ├── scenes.json
│           │   ├── audio/
│           │   ├── clips/
│           │   └── assembled/
│           └── metadata/
│               └── youtube.json
└── frontend/
    ├── .env.local
    ├── app/
    │   └── page.tsx             ← main UI
    ├── components/
    │   ├── PipelineProgress.tsx
    │   └── VideoPreview.tsx
    ├── hooks/
    │   └── usePipeline.ts       ← polling hook
    └── lib/
        └── api.ts               ← typed API client
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- Redis (running on localhost:6379)
- FFmpeg (on PATH)
- (optional) `PEXELS_API_KEY` env var for real stock footage

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Terminal 1 — FastAPI
uvicorn api:app --reload --port 8000

# Terminal 2 — Celery worker
celery -A workers.celery_app worker --loglevel=info
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

## API contract

### POST /api/scripts/create
Request body:
```json
{ "script": "...", "category": "education", "voice": "default", "music_style": "cinematic" }
```
Response:
```json
{ "project_id": "550e8400-e29b-41d4-a716-446655440000" }
```

### GET /api/pipeline/{project_id}/status
Response:
```json
{
  "overall_status": "running",
  "steps": [
    { "name": "scene_breakdown",  "status": "complete" },
    { "name": "voice_generation", "status": "running"  },
    { "name": "visual_selection", "status": "pending"  },
    ...
  ],
  "artifacts": {
    "final_video":  "/projects/<id>/final.mp4",
    "thumbnail":    "/projects/<id>/thumbnail.jpg",
    "subtitles":    "/projects/<id>/subtitles.srt",
    "metadata":     "/projects/<id>/metadata/youtube.json"
  },
  "error": null
}
```

Artifacts are `null` until the relevant step completes.
The frontend video player reads `artifacts.final_video` directly.

## Key fixes vs previous version

| Problem | Fix |
|---|---|
| Windows absolute paths returned | All paths converted to `/projects/<id>/...` URLs |
| No `artifacts` in response | `pipeline.py` builds the artifacts dict by checking if files exist |
| No static file serving | `api.py` mounts `/projects` directory via `StaticFiles` |
| No step tracking | `utils/status.py` writes `status.json` after every stage |
| Video preview broken | `VideoPreview.tsx` reads `artifacts.final_video` directly |
| Inconsistent API shape | Single typed response shape in `pipeline.py` + `lib/api.ts` |
