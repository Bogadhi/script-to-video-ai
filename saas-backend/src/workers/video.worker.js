const { Worker } = require('bullmq');
const connection = require('../config/redis');
const PipelineService = require('../services/pipeline.service');
const RenderService = require('../services/render.service');
const Metrics = require('../lib/metrics');
const StorageService = require('../services/storage.service');

const VIDEO_QUEUE_NAME = 'video-generation';
const WORKER_CONCURRENCY = parseInt(process.env.VIDEO_WORKER_CONCURRENCY, 10) || 2;

const videoWorker = new Worker(
    VIDEO_QUEUE_NAME,
    async (job) => {
        const { userId, payload } = job.data;
        const { script, category, niche, voice } = payload || {};
        const startedAt = Date.now();
        const projectId = payload?.projectId || (String(job.id).startsWith('job_') ? String(job.id) : `job_${job.id}`);

        try {
            Metrics.markRenderStarted();
            console.log(`[Worker] Job started: ${job.id} - projectId: ${projectId} (user ${userId})`);

            if (!script || !script.trim()) {
                throw new Error('No script provided in job payload.');
            }

            await job.updateProgress({ percent: 10, stage: 'generating-assets', projectId });
            console.log('[Worker][Stage 1] Asset generation starting...');

            const manifest = await PipelineService.run(projectId, script.trim(), {
                category: category || 'storytelling',
                niche: niche || '',
                voice: voice || 'epic',
                subscriptionPlan: payload?.subscriptionPlan || 'FREE',
                resumeFromLastChunk: payload?.resumeFromLastChunk !== false,
            });

            console.log(`[Worker][Stage 1] Pipeline complete - ${manifest.scenesCount} scenes.`);

            await job.updateProgress({ percent: 60, stage: 'rendering-video', projectId });
            console.log('[Worker][Stage 2] Remotion render starting...');
            console.log('[PIPELINE INPUT]', manifest.scenes?.length || 0);

            const videoPath = await RenderService.render(projectId, manifest);

            await job.updateProgress({ percent: 90, stage: 'finalizing', projectId });
            console.log(`[Worker][Stage 2] Render complete - ${videoPath}`);

            const publishedVideo = await StorageService.publishArtifact(projectId, videoPath, 'video/mp4');
            const result = {
                projectId,
                videoUrl: publishedVideo.publicUrl,
                thumbnailPath: manifest.thumbnailPath || '',
                duration: manifest.duration,
                scenesCount: manifest.scenesCount,
                metadata: {
                    ...manifest.metadata,
                    jobId: job.id,
                    completedAt: new Date().toISOString(),
                    storageDriver: publishedVideo.storageDriver,
                    objectKey: publishedVideo.objectKey,
                },
            };

            await job.updateProgress({ percent: 100, stage: 'complete', projectId });
            Metrics.markRenderCompleted(Date.now() - startedAt);
            console.log(`[Worker] Job ${job.id} completed. Video: ${result.videoUrl}`);
            return result;
        } catch (error) {
            Metrics.markRenderFailed(Date.now() - startedAt);
            console.error(`[Worker] Job ${job.id} failed:`, error.message);
            console.error(error.stack);
            throw error;
        }
    },
    {
        connection,
        concurrency: WORKER_CONCURRENCY,
    }
);

videoWorker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} completed -> ${result?.videoUrl}`);
});

videoWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed -> ${err?.message}`);
});

videoWorker.on('error', (err) => {
    console.error('[Worker] Worker error:', err.message);
});

module.exports = videoWorker;
