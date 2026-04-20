const fs = require('fs-extra');
const path = require('path');
const SceneService = require('./scene.service');
const VisualService = require('./visual.service');
const TTSService = require('./tts.service');
const QualityService = require('./quality.service');
const MusicService = require('./music.service');
const DiversityService = require('./diversity.service');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const PROJECTS_ROOT = path.resolve(BACKEND_ROOT, 'projects');
const MANIFEST_FILE_NAME = 'manifest.json';
const DRAFT_FILE_NAME = 'draft.manifest.json';
const CHUNK_WORD_TARGET = 750;

class PipelineService {
    static async run(projectId, script, options = {}) {
        console.log(`[Pipeline] Starting project: ${projectId}`);

        DiversityService.reset(projectId);
        process.env.CURRENT_PROJECT_ID = projectId;

        try {
            const projectDir = path.resolve(PROJECTS_ROOT, projectId);
            await fs.ensureDir(projectDir);

            const style = options.style || 'cinematic';
            const draftManifest = options.baseManifest || await this.loadProjectManifest(projectId, { preferDraft: true });
            const rebuildSceneIds = new Set((options.rebuildSceneIds || []).map((value) => Number(value)).filter((value) => Number.isFinite(value)));
            const sceneEdits = options.sceneEdits || {};
            const useDraft = Boolean(options.useDraft || draftManifest);
            let workingScript = script || draftManifest?.script || '';

            let baseScenes = [];
            let scriptChunks = [];
            if (useDraft && Array.isArray(draftManifest?.scenes) && draftManifest.scenes.length > 0) {
                baseScenes = draftManifest.scenes.map((scene) => this._cloneScene(scene));
                scriptChunks = Array.isArray(draftManifest?.metadata?.script_chunks) ? draftManifest.metadata.script_chunks : [];
                console.log(`[Pipeline] Loaded ${baseScenes.length} persisted draft scenes.`);
            } else {
                scriptChunks = this._splitScriptIntoChunks(workingScript);
                baseScenes = await this._buildScenesFromScriptChunks(scriptChunks, options.category || draftManifest?.metadata?.category || 'storytelling', style);
                console.log(`[Pipeline] Stage 1 complete - ${baseScenes.length} scenes across ${scriptChunks.length} chunks.`);
            }

            const mergedScenes = baseScenes.map((scene) => this._applyScenePatch(scene, sceneEdits[scene.scene_id] || sceneEdits[String(scene.scene_id)]));
            this._primeLockedAssets(projectId, mergedScenes);

            const processedScenes = [];
            for (const sourceScene of mergedScenes) {
                console.log(`[Pipeline] Processing scene ${sourceScene.scene_id}/${mergedScenes.length}...`);
                const currentScene = this._cloneScene(sourceScene);
                const actionPlan = this._buildScenePlan(sourceScene, rebuildSceneIds);
                processedScenes.push(await this._processScene(projectId, currentScene, mergedScenes, style, actionPlan));
            }

            const totalDuration = processedScenes.reduce((acc, scene) => acc + (scene.duration || 4), 0);
            const dominantMood = processedScenes[0]?.mood || 'epic';
            const musicPath = options.keepMusic && draftManifest?.music_path
                ? draftManifest.music_path
                : (await MusicService.getMusicTrack(dominantMood, totalDuration, projectId)) || draftManifest?.music_path || '';
            const renderChunks = this._buildRenderChunks(processedScenes);

            const manifest = {
                projectId,
                videoPath: path.resolve(projectDir, 'final_video.mp4'),
                thumbnailPath: processedScenes[0]?.image_path || draftManifest?.thumbnailPath || '',
                duration: totalDuration,
                scenesCount: processedScenes.length,
                script: workingScript,
                scenes: processedScenes,
                music_path: musicPath,
                subject_keywords: Array.isArray(processedScenes[0]?.keywords) ? processedScenes[0].keywords : [],
                metadata: {
                    generated_at: new Date().toISOString(),
                    category: options.category || draftManifest?.metadata?.category || 'storytelling',
                    style,
                    total_scenes: processedScenes.length,
                    total_duration: totalDuration,
                    status: options.status || 'DRAFT',
                    draft_status: options.draftStatus || (rebuildSceneIds.size > 0 ? 'PARTIAL_REBUILD_READY' : 'DRAFT_READY'),
                    partial_rebuild: rebuildSceneIds.size > 0,
                    rebuild_scene_ids: [...rebuildSceneIds],
                    locked_scene_ids: processedScenes.filter((scene) => scene.assetLocks?.visual || scene.assetLocks?.audio).map((scene) => scene.scene_id),
                    source_rotation_preserved: true,
                    script_chunks: scriptChunks,
                    render_chunks: renderChunks,
                    resume_from_last_chunk: options.resumeFromLastChunk !== false,
                    subscription_plan: options.subscriptionPlan || draftManifest?.metadata?.subscription_plan || 'FREE',
                    watermark_required: String(options.subscriptionPlan || draftManifest?.metadata?.subscription_plan || 'FREE').toUpperCase() === 'FREE',
                },
            };

            await this.saveDraftManifest(projectId, manifest);
            if (!options.persistDraftOnly) {
                await this._writeManifest(projectId, MANIFEST_FILE_NAME, manifest);
            }

            const diversitySummary = DiversityService.getSummary(projectId);
            console.log('[PIPELINE INPUT]', processedScenes.length);
            console.log('[PIPELINE SUMMARY]', `${diversitySummary.totalScenes} scenes - sources: ${diversitySummary.sources.join(', ')}`);
            console.log('[SOURCE DISTRIBUTION]', JSON.stringify(diversitySummary.sourceDistribution));
            console.log(`[Pipeline] Manifest saved for ${projectId}`);

            DiversityService.cleanup(projectId);
            return manifest;
        } catch (error) {
            console.error(`[Pipeline] Fatal error in ${projectId}: ${error.message}`);
            console.error(error.stack);
            DiversityService.cleanup(projectId);
            throw error;
        }
    }

    static async loadProjectManifest(projectId, { preferDraft = true } = {}) {
        const fileOrder = preferDraft ? [DRAFT_FILE_NAME, MANIFEST_FILE_NAME] : [MANIFEST_FILE_NAME, DRAFT_FILE_NAME];
        for (const fileName of fileOrder) {
            const filePath = this._getManifestPath(projectId, fileName);
            if (await fs.pathExists(filePath)) {
                return fs.readJSON(filePath);
            }
        }
        return null;
    }

    static async saveDraftManifest(projectId, manifest) {
        const draftManifest = {
            ...manifest,
            metadata: {
                ...(manifest.metadata || {}),
                last_saved_at: new Date().toISOString(),
            },
        };
        await this._writeManifest(projectId, DRAFT_FILE_NAME, draftManifest);
        return draftManifest;
    }

    static async patchDraftScene(projectId, sceneId, patch = {}) {
        const manifest = await this.loadProjectManifest(projectId, { preferDraft: true });
        if (!manifest) {
            throw new Error(`No draft found for ${projectId}`);
        }

        const targetId = Number(sceneId);
        let found = false;
        const nextScenes = (manifest.scenes || []).map((scene) => {
            if (Number(scene.scene_id) !== targetId) {
                return scene;
            }
            found = true;
            return this._applyScenePatch(scene, patch);
        });

        if (!found) {
            throw new Error(`Scene ${sceneId} not found in ${projectId}`);
        }

        const updatedManifest = {
            ...manifest,
            scenes: nextScenes,
            thumbnailPath: nextScenes[0]?.image_path || manifest.thumbnailPath || '',
            metadata: {
                ...(manifest.metadata || {}),
                draft_status: 'DIRTY',
                last_editor_update_at: new Date().toISOString(),
            },
        };

        return this.saveDraftManifest(projectId, updatedManifest);
    }

    static _splitScriptIntoChunks(script) {
        const words = String(script || '').split(/\s+/).filter(Boolean);
        if (words.length <= CHUNK_WORD_TARGET) {
            return [String(script || '').trim()].filter(Boolean);
        }

        const chunks = [];
        for (let index = 0; index < words.length; index += CHUNK_WORD_TARGET) {
            chunks.push(words.slice(index, index + CHUNK_WORD_TARGET).join(' '));
        }
        return chunks;
    }

    static async _buildScenesFromScriptChunks(scriptChunks, category, style) {
        const allScenes = [];
        for (let index = 0; index < scriptChunks.length; index += 1) {
            const chunkScenes = await SceneService.generateScenes(scriptChunks[index], category, style);
            chunkScenes.forEach((scene) => {
                allScenes.push({
                    ...scene,
                    scene_id: allScenes.length + 1,
                    scene: allScenes.length + 1,
                    chunk_index: index,
                });
            });
        }
        return allScenes;
    }

    static _buildRenderChunks(scenes) {
        const chunks = [];
        let current = { chunkIndex: 0, sceneIds: [], duration: 0 };
        for (const scene of scenes) {
            const duration = Number(scene.duration || 4);
            if (current.sceneIds.length > 0 && current.duration + duration > 300) {
                chunks.push(current);
                current = { chunkIndex: chunks.length, sceneIds: [], duration: 0 };
            }
            current.sceneIds.push(scene.scene_id);
            current.duration += duration;
        }
        if (current.sceneIds.length > 0) {
            chunks.push(current);
        }
        return chunks;
    }

    static _applyScenePatch(scene, patch = {}) {
        if (!patch || typeof patch !== 'object') {
            return this._cloneScene(scene);
        }

        const narrationChanged = typeof patch.narration === 'string' && patch.narration !== scene.narration;
        const visualPromptChanged = typeof patch.visual_prompt === 'string' && patch.visual_prompt !== scene.visual_prompt;
        const nextScene = {
            ...this._cloneScene(scene),
            ...patch,
            metadata: {
                ...(scene.metadata || {}),
                ...(patch.metadata || {}),
            },
            assetLocks: {
                visual: Boolean(scene.assetLocks?.visual),
                audio: Boolean(scene.assetLocks?.audio),
                ...(patch.assetLocks || {}),
            },
        };

        if (patch.lockVisual !== undefined) nextScene.assetLocks.visual = Boolean(patch.lockVisual);
        if (patch.lockAudio !== undefined) nextScene.assetLocks.audio = Boolean(patch.lockAudio);

        if (patch.video_path) {
            nextScene.image_path = null;
            nextScene.assetLocks.visual = true;
            nextScene.metadata.swapOrigin = patch.metadata?.swapOrigin || 'user-video-swap';
        } else if (patch.image_path) {
            nextScene.video_path = null;
            nextScene.assetLocks.visual = true;
            nextScene.metadata.swapOrigin = patch.metadata?.swapOrigin || 'user-image-swap';
        }

        if (patch.forceVisualReroll) {
            nextScene.assetLocks.visual = false;
            nextScene.video_path = '';
            nextScene.image_path = '';
        }

        if (patch.regenerateAudio) {
            nextScene.assetLocks.audio = false;
        }

        nextScene.metadata.needsAudioRegeneration = Boolean(patch.regenerateAudio || narrationChanged || nextScene.metadata.needsAudioRegeneration);
        nextScene.metadata.needsVisualRegeneration = Boolean(
            patch.forceVisualReroll ||
            visualPromptChanged ||
            patch.image_path ||
            patch.video_path ||
            nextScene.metadata.needsVisualRegeneration
        );

        return nextScene;
    }

    static _buildScenePlan(scene, rebuildSceneIds) {
        const visualLocked = Boolean(scene.assetLocks?.visual && (scene.video_path || scene.image_path));
        const audioLocked = Boolean(scene.assetLocks?.audio && scene.audio_path);
        const requestedRebuild = rebuildSceneIds.has(Number(scene.scene_id));
        const hasVisualAsset = Boolean(scene.video_path || scene.image_path);
        const hasNarration = typeof scene.narration === 'string' && scene.narration.trim().length > 0;
        const metadata = scene.metadata || {};

        return {
            regenerateAudio: hasNarration && !audioLocked && (requestedRebuild || !scene.audio_path || metadata.needsAudioRegeneration),
            regenerateVisual: !visualLocked && (requestedRebuild || !hasVisualAsset || metadata.needsVisualRegeneration),
            runQualityCheck: !visualLocked && (requestedRebuild || !hasVisualAsset || metadata.needsVisualRegeneration),
        };
    }

    static async _processScene(projectId, scene, allScenes, style, actionPlan) {
        const currentScene = this._cloneScene(scene);
        const maxRetries = parseInt(process.env.MAX_RETRIES, 10) || 1;
        let attempt = 0;
        let qualityPassed = !actionPlan.runQualityCheck;

        while (attempt <= maxRetries && !qualityPassed) {
            attempt += 1;
            try {
                if (actionPlan.regenerateAudio) {
                    const voiceData = await TTSService.generateAudio(projectId, currentScene);
                    currentScene.audio_path = voiceData.filePath;
                    currentScene.duration = Math.max(2, Math.min(6, voiceData.duration));
                    currentScene.metadata = {
                        ...(currentScene.metadata || {}),
                        needsAudioRegeneration: false,
                    };
                } else {
                    currentScene.duration = Math.max(2, Math.min(6, currentScene.duration || 4.0));
                }

                if (actionPlan.regenerateVisual) {
                    const mediaPath = await VisualService.generateImage(projectId, currentScene, style, allScenes.length);
                    if (currentScene.video_path) {
                        currentScene.image_path = null;
                    } else {
                        currentScene.image_path = mediaPath;
                        currentScene.video_path = null;
                    }
                    currentScene.motion = VisualService.getMotionMetadata(currentScene);
                    currentScene.metadata = {
                        ...(currentScene.metadata || {}),
                        lastVisualRegenerationAt: new Date().toISOString(),
                        needsVisualRegeneration: false,
                    };
                }

                if (actionPlan.runQualityCheck) {
                    const visualScore = Number(currentScene.metadata?.relevance_score || 0.75);
                    if (visualScore < 0.7 && attempt <= maxRetries) {
                        currentScene.search_queries = (currentScene.search_queries || []).map((query) => query.split(' ').slice(0, 6).join(' '));
                        currentScene.metadata = {
                            ...(currentScene.metadata || {}),
                            needsVisualRegeneration: true,
                        };
                        console.warn(`[Pipeline] Scene ${scene.scene_id} relevance ${visualScore.toFixed(2)} below threshold, forcing simplified reroll.`);
                        continue;
                    }

                    try {
                        const evaluation = await QualityService.evaluateScene(currentScene);
                        const score = evaluation.total_score || 7;
                        currentScene.quality_scores = {
                            ...evaluation,
                            relevance_score: currentScene.metadata?.relevance_score || visualScore,
                        };
                        qualityPassed = true;
                        if (score < 7 && attempt <= maxRetries) {
                            currentScene.visual_prompt = `${currentScene.visual_prompt}, stronger subject clarity, cleaner composition, simpler background`;
                            qualityPassed = false;
                        }
                    } catch (qualityError) {
                        console.warn(`[Pipeline] Quality check skipped: ${qualityError.message}`);
                        qualityPassed = true;
                    }
                } else {
                    qualityPassed = true;
                }
            } catch (sceneError) {
                console.error(`[Pipeline] Scene ${scene.scene_id} error: ${sceneError.message}`);
                currentScene.duration = currentScene.duration || 4.0;
                currentScene.audio_path = currentScene.audio_path || '';
                currentScene.image_path = currentScene.image_path || '';
                currentScene.video_path = currentScene.video_path || '';
                currentScene.motion = currentScene.motion || { startScale: 1, endScale: 1.06 };
                qualityPassed = true;
            }
        }

        return currentScene;
    }

    static _primeLockedAssets(projectId, scenes) {
        for (const scene of scenes || []) {
            if (!scene.assetLocks?.visual) continue;
            const assetPath = scene.video_path || scene.image_path;
            if (!assetPath) continue;
            DiversityService.register(projectId, assetPath, scene.video_path ? 'LOCKED_VIDEO' : 'LOCKED_IMAGE', {
                sceneId: scene.scene_id,
                locked: true,
            });
        }
    }

    static async _writeManifest(projectId, fileName, manifest) {
        const manifestPath = this._getManifestPath(projectId, fileName);
        await fs.ensureDir(path.dirname(manifestPath));
        await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
        return manifestPath;
    }

    static _getManifestPath(projectId, fileName) {
        return path.resolve(PROJECTS_ROOT, projectId, fileName);
    }

    static _cloneScene(scene) {
        return JSON.parse(JSON.stringify(scene || {}));
    }
}

module.exports = PipelineService;
