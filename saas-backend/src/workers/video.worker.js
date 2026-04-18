const { Worker } = require('bullmq');
const connection = require('../config/redis');
const PipelineService = require('../services/pipeline.service');
const RenderService = require('../services/render.service');
const path = require('path');

const VIDEO_QUEUE_NAME = 'video-generation';

/**
 * Video Generation Worker
 * Processes cinematic video generation jobs via BullMQ.
 * Project IDs are standardized to `job_${job.id}` to match the API and DB.
 */
const videoWorker = new Worker(
    VIDEO_QUEUE_NAME,
    async (job) => {
        const { userId, payload } = job.data;
        const { script, category, niche, voice } = payload || {};

        // STANDARDIZED: use job_ prefix to match index.js / videoJobs.js / frontend
        const projectId = `job_${job.id}`;

        try {
            console.log(`🚀 [Worker] Job started: ${job.id} — projectId: ${projectId} (user ${userId})`);

            // 0. Validate that we have a script to work with
            if (!script || !script.trim()) {
                throw new Error('No script provided in job payload.');
            }

            // 1. Pipeline: Scene → Voice → Visual → Manifest
            await job.updateProgress({ percent: 10, stage: 'generating-assets', projectId });
            console.log(`[Worker][Stage 1] Asset generation starting...`);

            const manifest = await PipelineService.run(projectId, script.trim(), {
                category: category || 'storytelling',
                niche: niche || '',
                voice: voice || 'epic',
            });

            console.log(`[Worker][Stage 1] Pipeline complete — ${manifest.scenesCount} scenes.`);

            // 2. Remotion Render
            await job.updateProgress({ percent: 60, stage: 'rendering-video', projectId });
            console.log(`[Worker][Stage 2] Remotion render starting...`);
            console.log('[PIPELINE INPUT]', manifest.scenes?.length || 0);

            const videoPath = await RenderService.render(projectId, manifest);

            await job.updateProgress({ percent: 90, stage: 'finalizing', projectId });
            console.log(`[Worker][Stage 2] Render complete — ${videoPath}`);

            // 3. Build final result contract
            const BASE_URL = process.env.BASE_URL || 'http://localhost:5002';
            const result = {
                projectId,
                videoUrl: `${BASE_URL}/videos/${projectId}/final_video.mp4`,
                thumbnailPath: manifest.thumbnailPath || '',
                duration: manifest.duration,
                scenesCount: manifest.scenesCount,
                metadata: {
                    ...manifest.metadata,
                    jobId: job.id,
                    completedAt: new Date().toISOString(),
                },
            };

            await job.updateProgress({ percent: 100, stage: 'complete', projectId });
            console.log(`✅ [Worker] Job ${job.id} completed. Video: ${result.videoUrl}`);
            return result;

        } catch (error) {
            console.error(`❌ [Worker] Job ${job.id} failed:`, error.message);
            console.error(error.stack);
            throw error; // Re-throw so BullMQ marks it as failed
        }
    },
    {
        connection: connection,
        concurrency: 1, // One video at a time for stability on single server
    }
);

videoWorker.on('completed', (job, result) => {
    console.log(`[Worker] ✅ Job ${job.id} completed → ${result?.videoUrl}`);
});

videoWorker.on('failed', (job, err) => {
    console.error(`[Worker] ❌ Job ${job?.id} failed → ${err?.message}`);
});

videoWorker.on('error', (err) => {
    console.error('[Worker] Worker error:', err.message);
});

module.exports = videoWorker;
