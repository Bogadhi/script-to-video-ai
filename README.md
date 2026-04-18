# 🎬 AI Script-to-YouTube Video Automation Platform

Convert a text script into a fully produced, YouTube-ready cinematic video — automatically.

**3 steps for the user:**

1. **Upload a script** → 2. **Review the preview** → 3. **Click Approve** → Video published to YouTube ✅

---

## ⚡ Quick Start

### Prerequisites

- **Python 3.11+** and **Node.js 20+** installed
- **FFmpeg** installed and on your PATH ([download](https://ffmpeg.org/download.html))
- **Redis** running locally (or via Docker)
- API keys (see Configuration)

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate    # Windows
# source venv/bin/activate  # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env with your API keys

# Start Redis (if not using Docker)
# docker run -d -p 6379:6379 redis:7-alpine

# Start FastAPI backend
uvicorn main:app --reload --port 8000

# In a separate terminal: Start Celery worker
celery -A workers.pipeline_worker.celery_app worker --loglevel=info
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### 3. Docker (All-in-one)

```bash
# From project root
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

docker-compose up --build
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

---

## 🔑 API Keys Required

| Service                       | Key                  | Purpose                                                                  |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------ |
| **OpenAI**                    | `OPENAI_API_KEY`     | Scene breakdown, DALL-E 3 images, TTS voice, Whisper subtitles, metadata |
| **ElevenLabs** _(optional)_   | `ELEVENLABS_API_KEY` | Premium human-like voices (falls back to OpenAI TTS)                     |
| **Stability AI** _(optional)_ | `STABILITY_API_KEY`  | Alternative image generation (falls back to DALL-E 3)                    |
| **Google/YouTube**            | See below            | Upload videos to YouTube                                                 |

### YouTube OAuth2 Setup (One-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **YouTube Data API v3**
3. Create **OAuth 2.0 credentials** (Desktop app type)
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your `.env`
5. Run: `python backend/scripts/get_youtube_token.py`
6. Copy the printed `GOOGLE_REFRESH_TOKEN` to your `.env`

---

## 🏗️ Architecture

```
video-automation/
├── backend/               # Python FastAPI + Celery
│   ├── main.py            # API entrypoint (port 8000)
│   ├── services/          # AI pipeline services
│   │   ├── scene_analyzer.py   # GPT-4o script → scenes
│   │   ├── voiceover.py        # ElevenLabs / OpenAI TTS
│   │   ├── image_gen.py        # DALL-E 3 / Stability AI
│   │   ├── video_builder.py    # FFmpeg Ken Burns + assembly
│   │   ├── music_engine.py     # Royalty-free background music
│   │   ├── subtitle_gen.py     # Whisper → SRT
│   │   ├── thumbnail_gen.py    # Pillow title overlay
│   │   ├── metadata_gen.py     # GPT-4o SEO metadata
│   │   └── youtube_upload.py   # YouTube Data API v3
│   ├── workers/
│   │   └── pipeline_worker.py  # Celery tasks (full pipeline)
│   ├── routers/           # FastAPI route handlers
│   └── models/db.py       # SQLAlchemy (SQLite/PostgreSQL)
├── frontend/              # Next.js 14 App Router
│   ├── src/app/page.tsx       # Script upload + pipeline progress
│   └── src/app/preview/       # Preview approval + YouTube upload
├── music/                 # Royalty-free tracks by mood
├── docker-compose.yml     # Full stack in one command
└── README.md
```

### Full Pipeline Flow

```
Script Upload
    ↓ GPT-4o Scene Breakdown
    ↓ ElevenLabs / OpenAI TTS Voiceover
    ↓ DALL-E 3 / Stability AI Images
    ↓ FFmpeg Ken Burns Scene Videos
    ↓ Background Music Mix
    ↓ FFmpeg Final Assembly
    ↓ Whisper Subtitle Generation
    ↓ Pillow Thumbnail Generation
    ↓ GPT-4o SEO Metadata
    ↓ User Preview & Approval
    ↓ YouTube Data API v3 Upload
```

---

## 🎵 Background Music

Add your own royalty-free `.mp3` files to the `music/` folders:

```
music/
├── inspirational/    # Travel, nature, motivational
├── cinematic/        # Drama, documentary
├── educational/      # Explainers, tutorials
└── suspense/         # Mystery, thriller
```

Recommended free sources: [Pixabay Music](https://pixabay.com/music/), [Free Music Archive](https://freemusicarchive.org/)

---

## 🔌 API Reference

| Endpoint                           | Method | Description                   |
| ---------------------------------- | ------ | ----------------------------- |
| `GET /health`                      | GET    | Health check                  |
| `POST /api/scripts/upload`         | POST   | Upload script, create project |
| `GET /api/scripts/{id}`            | GET    | Get project details           |
| `POST /api/pipeline/{id}/start`    | POST   | Start pipeline                |
| `GET /api/pipeline/{id}/status`    | GET    | Poll pipeline status          |
| `GET /api/pipeline/{id}/stream`    | GET    | SSE real-time status          |
| `GET /api/pipeline/{id}/metadata`  | GET    | Get YouTube metadata          |
| `PUT /api/pipeline/{id}/metadata`  | PUT    | Edit YouTube metadata         |
| `POST /api/youtube/{id}/upload`    | POST   | Trigger YouTube upload        |
| `GET /api/projects/{id}/video`     | GET    | Stream final video            |
| `GET /api/projects/{id}/thumbnail` | GET    | Get thumbnail image           |
| `GET /api/projects/{id}/subtitles` | GET    | Download SRT file             |

Full interactive docs at: `http://localhost:8000/docs`

---

## 💡 Tips

- **Cost optimization**: Each DALL-E 3 HD image costs ~$0.08. A 5-scene video ≈ $0.40 in images.
- **Real video gen**: Swap `image_gen.py` for Runway or Pika API calls for true AI video.
- **Voices**: Add your ElevenLabs voice IDs to `.env` for custom voices.
- **Database**: Change `DATABASE_URL` to a PostgreSQL URL for production.
- **Storage**: Mount an S3 bucket or NFS to `OUTPUT_DIR` for cloud file storage.
