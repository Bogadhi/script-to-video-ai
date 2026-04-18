const express = require('express');
const prisma = require('../lib/db');
const { authenticateToken } = require('../middleware/auth');
const { videoQueue } = require('../queues/video.queue');

const router = express.Router();

function assertJobAccess(job, userId) {
  if (!job) {
    return { ok: false, status: 404, message: 'Job not found.' };
  }
  if (job.data.userId !== userId) {
    return { ok: false, status: 403, message: 'Access denied to this job.' };
  }
  return { ok: true };
}

function serializeJob(job, state) {
  const progress =
    typeof job.progress === 'object' && job.progress !== null ? job.progress : {};

  return {
    jobId: job.id,
    state,
    progress: progress.percent || 0,
    stage: progress.stage || 'queued',
    projectId: progress.projectId || `job_${job.id}`,
    currentStep: progress.currentStep || null,
    result: state === 'completed' ? job.returnvalue || null : null,
    error: state === 'failed' ? job.failedReason || 'Job failed.' : null,
    attemptsMade: job.attemptsMade,
    queuedAt: job.timestamp,
    finishedAt: job.finishedOn || null,
  };
}

/**
 * POST /generate-video  (also /api/generate-video)
 * Validates credits, deducts 1 credit, queues the job, creates a Project record.
 */
async function enqueueVideoJob(req, res) {
  try {
    const userId = req.user.user_id;

    // Check credits
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, credits: true, plan: true },
    });

    if (!user || user.credits < 1) {
      return res.status(403).json({ message: 'Insufficient credits. Please upgrade your plan.' });
    }

    // Queue the job
    const job = await videoQueue.add('generate-video', {
      userId,
      authHeader: req.headers.authorization,
      payload: req.body,
    });

    const projectId = `job_${job.id}`;

    // Deduct credit + create project record atomically
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { credits: { decrement: 1 } },
      }),
      prisma.project.upsert({
        where: { projectName: projectId },
        update: {},
        create: { userId: user.id, projectName: projectId },
      }),
    ]);

    console.log(`[VideoJobs] Job queued: ${job.id} — user ${userId} — credits remaining: ${user.credits - 1}`);

    return res.status(202).json({
      success: true,
      jobId: job.id,
      projectId,
      state: 'queued',
      remainingCredits: user.credits - 1,
    });
  } catch (error) {
    console.error('[Video Queue Error]', error);
    return res.status(500).json({ message: 'Unable to queue video generation right now.' });
  }
}

/**
 * GET /job/:id  (also /api/job/:id)
 * Returns current status + result of a queued job.
 */
async function getJobStatus(req, res) {
  try {
    const userId = req.user.user_id;
    const job = await videoQueue.getJob(req.params.id);
    const access = assertJobAccess(job, userId);

    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const state = await job.getState();
    return res.json(serializeJob(job, state));
  } catch (error) {
    console.error('[Job Status Error]', error);
    return res.status(500).json({ message: 'Unable to fetch job status.' });
  }
}

router.post('/generate-video', authenticateToken, enqueueVideoJob);
router.post('/api/generate-video', authenticateToken, enqueueVideoJob);
router.get('/job/:id', authenticateToken, getJobStatus);
router.get('/api/job/:id', authenticateToken, getJobStatus);

module.exports = router;
