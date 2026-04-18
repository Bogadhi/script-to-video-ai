const fs = require('fs-extra');
const path = require('path');
const SceneService = require('./scene.service');
const VisualService = require('./visual.service');
const TTSService = require('./tts.service');
const QualityService = require('./quality.service');
const MusicService = require('./music.service');

// Absolute backend root — consistent regardless of cwd
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const PROJECTS_ROOT = path.resolve(BACKEND_ROOT, 'projects');

/**
 * Cinematic Pipeline Orchestrator
 * Coordinates Scene → Voice → Visual → Quality → Music → Manifest.
 * Every stage has fallbacks so the pipeline NEVER crashes on a partial failure.
 */
class PipelineService {
    /**
     * @param {string} projectId - e.g. "job_42"
     * @param {string} script - User's raw text script.
     * @param {Object} options - { category, niche, voice }
     * @returns {Promise<Object>} - Full project manifest.
     */
    static async run(projectId, script, options = {}) {
        console.log(`[Pipeline] ▶ Starting project: ${projectId}`);

        try {
            // 1. Scene Generation (AI or fallback)
            console.log('[Pipeline] Stage 1: Scene generation...');
            const scenes = await SceneService.generateScenes(
                script,
                options.category || 'storytelling'
            );
            console.log(`[Pipeline] Stage 1 complete — ${scenes.length} scenes.`);

            const processedScenes = [];

            // 2. Per-scene: Voice → Visual → Quality
            for (const scene of scenes) {
                console.log(`[Pipeline] Processing scene ${scene.scene_id}/${scenes.length}...`);

                let currentScene = { ...scene };
                let attempt = 0;
                const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 1;
                let qualityPassed = false;

                while (attempt <= MAX_RETRIES && !qualityPassed) {
                    attempt++;

                    try {
                        // Voice generation (with silent WAV fallback inside TTSService)
                        const voiceData = await TTSService.generateAudio(projectId, currentScene);
                        currentScene.audio_path = voiceData.filePath;
                        // Clamp duration to 3-6 seconds for cinematic pacing
                        currentScene.duration = Math.max(3.0, Math.min(6.0, voiceData.duration));

                        // Visual generation (with PNG fallback inside VisualService)
                        const imagePath = await VisualService.generateImage(projectId, currentScene);
                        currentScene.image_path = imagePath;
                        currentScene.motion = VisualService.getMotionMetadata(currentScene);

                        // Quality evaluation (Gemini API — non-fatal if it fails)
                        try {
                            const evaluation = await QualityService.evaluateScene(currentScene);
                            const score = evaluation.total_score || 7;
                            console.log(`[Pipeline] Scene ${scene.scene_id} quality score: ${score.toFixed(2)}`);

                            if (score >= 7) {
                                qualityPassed = true;
                                currentScene.quality_scores = evaluation;
                            } else if (attempt <= MAX_RETRIES) {
                                console.warn(`[Pipeline] Scene ${scene.scene_id} quality below threshold — enhancing prompt.`);
                                currentScene.visual_prompt = `${currentScene.visual_prompt}, ultra cinematic, award-winning photography, dramatic lighting, sharp focus, professional color grading`;
                            } else {
                                console.warn(`[Pipeline] Scene ${scene.scene_id}: Max retries reached, proceeding with current result.`);
                                qualityPassed = true;
                            }
                        } catch (qualityErr) {
                            // Quality check is non-critical — proceed anyway
                            console.warn(`[Pipeline] Quality check skipped: ${qualityErr.message}`);
                            qualityPassed = true;
                        }

                    } catch (sceneErr) {
                        console.error(`[Pipeline] Scene ${scene.scene_id} error:`, sceneErr.message);
                        // Ensure we have fallback values so the scene can still be rendered
                        currentScene.duration = currentScene.duration || 4.0;
                        currentScene.audio_path = currentScene.audio_path || '';
                        currentScene.image_path = currentScene.image_path || '';
                        currentScene.motion = currentScene.motion || { startScale: 1, endScale: 1.06 };
                        qualityPassed = true; // Stop retrying
                    }
                }

                processedScenes.push(currentScene);
            }

            const totalDuration = processedScenes.reduce((acc, s) => acc + (s.duration || 4), 0);
            const subjectKeywords = Array.isArray(processedScenes[0]?.keywords) ? processedScenes[0].keywords : [];

            // 3. Music selection
            const dominantMood = processedScenes[0]?.mood || 'epic';
            const musicPath = (await MusicService.getMusicTrack(dominantMood, totalDuration, projectId)) || '';
            console.log(`[Pipeline] Music track: ${musicPath || 'none'}`);

            // 4. Assemble manifest
            const projectDir = path.resolve(PROJECTS_ROOT, projectId);
            await fs.ensureDir(projectDir);

            const manifest = {
                projectId,
                videoPath: path.resolve(projectDir, 'final_video.mp4'),
                thumbnailPath: processedScenes[0]?.image_path || '',
                duration: totalDuration,
                scenesCount: processedScenes.length,
                script,
                scenes: processedScenes,
                music_path: musicPath,
                subject_keywords: subjectKeywords,
                metadata: {
                    generated_at: new Date().toISOString(),
                    category: options.category || 'storytelling',
                    total_scenes: processedScenes.length,
                    total_duration: totalDuration,
                },
            };

            const manifestPath = path.resolve(projectDir, 'manifest.json');
            await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
            console.log('[PIPELINE INPUT]', processedScenes.length);
            console.log(`[Pipeline] ✅ Manifest saved: ${manifestPath}`);

            return manifest;

        } catch (err) {
            console.error(`[Pipeline] ❌ Fatal error in ${projectId}:`, err.message);
            console.error(err.stack);
            throw err;
        }
    }
}

module.exports = PipelineService;
