const fs = require('fs-extra');
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { authenticateToken } = require('./middleware/auth');
const prisma = require('./lib/db');
const Metrics = require('./lib/metrics');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== STATIC VIDEO SERVING ==========
// Projects are saved to: saas-backend/projects/{projectId}/final_video.mp4
// Served at: /videos/{projectId}/final_video.mp4
// __dirname = saas-backend/src — so we go up one level to saas-backend/projects
const PROJECTS_ROOT = path.resolve(__dirname, '../projects');
fs.ensureDir(PROJECTS_ROOT);

const assetsDir = path.join(__dirname, '..', 'assets');
fs.ensureDir(assetsDir);
console.log('[STATIC PATH]', PROJECTS_ROOT);

console.log('📁 Serving videos from:', PROJECTS_ROOT);

app.use('/videos', (req, res, next) => {
  console.log('🎬 Video request:', req.url);
  next();
});
app.use('/videos', express.static(PROJECTS_ROOT));
app.use('/assets', express.static(assetsDir));
// ========== END STATIC VIDEO SERVING ==========

// Debug middleware
app.use((req, res, next) => {
  Metrics.markApiRequest();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===== ROUTES =====
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const creditRoutes = require('./routes/credits');
const videoJobRoutes = require('./routes/videoJobs');
const editorApiRoutes = require('./routes/editor.api');

async function findQueueJob(projectId) {
  const { videoQueue } = require('./queues/video.queue');
  return (await videoQueue.getJob(projectId)) || (await videoQueue.getJob(projectId.replace(/^job_/, '')));
}

// Start video worker (inline — it registers itself with BullMQ on start)
require('./workers/video.worker');

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/credits', creditRoutes);
app.use(videoJobRoutes); // handles /generate-video, /job/:id (both root and /api/ variants)
app.use(editorApiRoutes);

// ===== PIPELINE STATUS (GATED) =====
app.get('/api/pipeline/:project_id/status', authenticateToken, async (req, res) => {
  const { project_id } = req.params;

  try {
    const job = await findQueueJob(project_id);

    if (!job) return res.status(404).json({ message: 'Job not found.' });
    if (job.data.userId !== req.user.user_id) return res.status(403).json({ message: 'Access denied.' });

    const state = await job.getState();
    const progress = (typeof job.progress === 'object' && job.progress !== null) ? job.progress : {};

    let status = 'processing';
    if (state === 'completed') status = 'completed';
    if (state === 'failed') status = 'error';
    if (state === 'waiting' || state === 'delayed') status = 'pending';

    res.json({
      status,
      progress: progress.percent || 0,
      stage: progress.stage || 'queued',
      project_id,
    });
  } catch (err) {
    console.error('[Pipeline Status Error]', err);
    res.status(500).json({ message: 'Error fetching progress.' });
  }
});

// ===== PIPELINE RESULT (GATED) =====
app.get('/api/pipeline/:project_id/result', authenticateToken, async (req, res) => {
  const { project_id } = req.params;

  try {
    const job = await findQueueJob(project_id);

    if (!job) return res.status(404).json({ message: 'Job not found.' });
    if (job.data.userId !== req.user.user_id) return res.status(403).json({ message: 'Access denied.' });

    const state = await job.getState();
    if (state !== 'completed') {
      return res.status(400).json({ status: state, message: 'Job not finished yet.' });
    }

    res.json(job.returnvalue);
  } catch (err) {
    console.error('[Pipeline Result Error]', err);
    res.status(500).json({ message: 'Error fetching result.' });
  }
});

// ===== PIPELINE METADATA (GATED) =====
app.get('/api/pipeline/:project_id/metadata', authenticateToken, async (req, res) => {
  const { project_id } = req.params;
  try {
    const project = await prisma.project.findUnique({ where: { projectName: project_id } });
    if (!project || project.userId !== req.user.user_id) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const manifestPath = path.join(__dirname, '..', 'projects', project_id, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ message: 'Metadata not found.' });
    }

    const manifest = await fs.readJSON(manifestPath);
    res.json(manifest.metadata || {});
  } catch (err) {
    console.error('[Pipeline Metadata Error]', err);
    res.status(500).json({ message: 'Error fetching metadata.' });
  }
});

// ===== PIPELINE RETRY (GATED) =====
app.post('/api/pipeline/:project_id/retry', authenticateToken, async (req, res) => {
  const { project_id } = req.params;
  try {
    const { videoQueue } = require('./queues/video.queue');
    const oldJob = await findQueueJob(project_id);

    if (!oldJob) return res.status(404).json({ message: 'Job not found.' });
    if (oldJob.data.userId !== req.user.user_id) return res.status(403).json({ message: 'Access denied.' });

    const newJob = await videoQueue.add('generate-video', oldJob.data);
    res.json({ project_id: oldJob.data?.payload?.projectId || String(newJob.id), job_id: newJob.id });
  } catch (err) {
    console.error('[Pipeline Retry Error]', err);
    res.status(500).json({ message: 'Error retrying pipeline.' });
  }
});

// ===== ADS SYSTEM =====
const MOCK_ADS = [
  {
    id: 'ad-1',
    title: 'Cinematic Overlays Pro',
    body: 'Get 500+ premium 4K overlays for your next video project.',
    brand: 'FX Master',
    cta: 'Claim Discount',
    targetUrl: 'https://example.com/fx-master',
    imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
  },
  {
    id: 'ad-2',
    title: 'AI Voiceover Studio',
    body: 'The most realistic AI voices for creators.',
    brand: 'Vocalize.ai',
    cta: 'Try for Free',
    targetUrl: 'https://example.com/vocalize',
    imageUrl: 'https://images.unsplash.com/photo-1478737270239-2fccd2c7862a?w=400&q=80',
  },
  {
    id: 'ad-3',
    title: 'Stock Footage Library',
    body: 'Millions of premium clips, royalty-free for creators.',
    brand: 'ClipVault',
    cta: 'Browse Free',
    targetUrl: 'https://example.com/clipvault',
    imageUrl: 'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=400&q=80',
  },
  {
    id: 'ad-4',
    title: 'Music for Creators',
    body: 'License-free cinematic soundtracks for every mood.',
    brand: 'SoundLayer',
    cta: 'Listen Now',
    targetUrl: 'https://example.com/soundlayer',
    imageUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
  },
];

// In-memory impression/click counters (production: store in DB)
const adImpressions = {};
const adClicks = {};

// GET /api/ads — return all ads
app.get('/api/ads', (req, res) => {
  res.json(MOCK_ADS);
});

// POST /api/ads/impression — track ad view
app.post('/api/ads/impression', (req, res) => {
  const { adId } = req.body || {};
  if (adId) {
    adImpressions[adId] = (adImpressions[adId] || 0) + 1;
    console.log(`[Ads] Impression: ${adId} — total: ${adImpressions[adId]}`);
  }
  res.json({ success: true, adId: adId || null });
});

// POST /api/ads/click — track ad click
app.post('/api/ads/click', (req, res) => {
  const { adId } = req.body || {};
  if (adId) {
    adClicks[adId] = (adClicks[adId] || 0) + 1;
    console.log(`[Ads] Click: ${adId} — total: ${adClicks[adId]}`);
  }
  res.json({ success: true, adId: adId || null });
});

// GET /api/ads/stats — quick debug endpoint
app.get('/api/ads/stats', (req, res) => {
  res.json({ impressions: adImpressions, clicks: adClicks });
});

// ===== GATED GENERATION via API (alternative entry point) =====
app.post('/api/scripts/create', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.credits < 1) {
      return res.status(403).json({ message: 'Insufficient credits. Please upgrade your plan.' });
    }

    const crypto = require('crypto');
    const projectId = `job_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    await prisma.$transaction([
      prisma.project.create({
        data: { userId: user.id, projectName: projectId },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { credits: { decrement: 1 } },
      }),
    ]);

    const { videoQueue } = require('./queues/video.queue');
    const job = await videoQueue.add('generate-video', {
      userId,
      authHeader: req.headers.authorization,
      payload: {
        ...req.body,
        projectId,
        subscriptionPlan: user.plan || 'FREE',
        resumeFromLastChunk: true,
      },
    }, { jobId: projectId });

    res.json({
      project_id: projectId,
      job_id: job.id,
      remaining_credits: user.credits - 1,
    });
  } catch (err) {
    console.error('[Scripts Create Error]', err.message);
    res.status(500).json({ message: 'Generation service unavailable.' });
  }
});

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    videoDir: PROJECTS_ROOT,
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(Metrics.toPrometheus());
});

// ===== 404 FALLBACK =====
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`🚀 SaaS Backend running on port ${PORT}`);
  console.log(`📁 Videos served from: ${PROJECTS_ROOT}`);
  console.log(`⚡ Cinematic Engine: ACTIVE`);
});
