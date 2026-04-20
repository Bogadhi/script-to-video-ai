const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const AudioService = require('./audio.service');
const StorageService = require('./storage.service');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const PROJECTS_ROOT = path.resolve(BACKEND_ROOT, 'projects');

class RenderService {
    static async render(projectId, manifest) {
        const remotionDir = path.resolve(BACKEND_ROOT, 'remotion');
        const entryFile = path.resolve(remotionDir, 'src', 'index.ts');
        const projectDir = path.resolve(PROJECTS_ROOT, projectId);
        const finalOutputPath = path.resolve(projectDir, 'final_video.mp4');

        await fs.ensureDir(projectDir);

        const baseUrl = process.env.BASE_URL || 'http://localhost:5002';
        const sanitizedScenes = await this._sanitizeScenes(projectId, manifest.scenes || []);
        if (sanitizedScenes.length < 3) {
            throw new Error('Insufficient scenes generated');
        }

        let musicPath = manifest.music_path || '';
        if (musicPath && !fs.existsSync(musicPath) && !this._isValidHttpUrl(musicPath)) {
            musicPath = '';
        }

        const preparedAudio = await AudioService.prepareRenderAudio(projectId, {
            scenes: sanitizedScenes,
            musicPath,
        });
        const preparedScenes = preparedAudio.scenes || sanitizedScenes;
        const renderChunks = this._chunkScenes(preparedScenes);
        const renderedSegments = [];
        let musicStartFrame = 0;

        for (let chunkIndex = 0; chunkIndex < renderChunks.length; chunkIndex += 1) {
            const chunkScenes = renderChunks[chunkIndex];
            const segmentDir = path.resolve(projectDir, 'segments');
            await fs.ensureDir(segmentDir);
            const segmentPath = path.resolve(segmentDir, `segment_${String(chunkIndex).padStart(3, '0')}.mp4`);

            if (manifest.metadata?.resume_from_last_chunk !== false && await this._isUsableFile(segmentPath)) {
                renderedSegments.push(segmentPath);
                musicStartFrame += this._durationToFrames(chunkScenes.reduce((acc, scene) => acc + (scene.duration || 3), 0));
                continue;
            }

            const propsPath = path.resolve(segmentDir, `segment_${String(chunkIndex).padStart(3, '0')}.props.json`);
            const renderProps = {
                scenes: chunkScenes.map((scene) => ({
                    scene_id: scene.scene_id,
                    image_path: scene.video_path ? null : (scene.image_path || this._blankImageUrl()),
                    video_path: scene.video_path || '',
                    audio_path: scene.audio_path || '',
                    duration: scene.duration,
                    composition: scene.composition || 'medium',
                    story_role: scene.story_role || 'development',
                    shot_type: scene.shot_type || 'medium_shot',
                    motion: scene.motion || { startScale: 1, endScale: 1.1, xStart: 0, xEnd: 12, yStart: 0, yEnd: -8 },
                })),
                musicPath: this._buildMusicUrl(preparedAudio.musicPath || musicPath, baseUrl, projectId),
                musicStartFrame,
                showWatermark: Boolean(manifest.metadata?.watermark_required),
                watermarkText: manifest.metadata?.watermark_required ? 'Bogadhi Free' : '',
            };

            await fs.writeJSON(propsPath, renderProps, { spaces: 2 });
            await this._renderSegment(remotionDir, entryFile, propsPath, segmentPath);
            renderedSegments.push(segmentPath);
            musicStartFrame += this._durationToFrames(chunkScenes.reduce((acc, scene) => acc + (scene.duration || 3), 0));
        }

        if (renderedSegments.length === 1) {
            await fs.copy(renderedSegments[0], finalOutputPath, { overwrite: true });
        } else {
            await this._stitchSegments(projectDir, renderedSegments, finalOutputPath);
        }

        await StorageService.publishArtifact(projectId, finalOutputPath, 'video/mp4');
        return finalOutputPath;
    }

    static async _sanitizeScenes(projectId, scenes) {
        const usedAssets = new Set();
        const sanitizedScenes = [];
        for (const scene of scenes || []) {
            const safeScene = { ...scene };
            if (!safeScene.narration) safeScene.narration = '';
            if (typeof safeScene.duration !== 'number' || safeScene.duration <= 0) safeScene.duration = 3;

            const hasRemoteVideo = this._isValidHttpUrl(safeScene.video_path);
            const hasLocalImage = safeScene.image_path && fs.existsSync(safeScene.image_path);
            const hasRemoteImage = this._isValidHttpUrl(safeScene.image_path);

            if (!hasRemoteVideo && !hasLocalImage && !hasRemoteImage) {
                safeScene.image_path = await this._createPlaceholder(projectId, safeScene.scene_id);
            }
            if (hasRemoteVideo) {
                safeScene.image_path = null;
            }
            if (safeScene.audio_path && !fs.existsSync(safeScene.audio_path)) {
                safeScene.audio_path = '';
            }
            if (safeScene.image_path && !this._isValidHttpUrl(safeScene.image_path)) {
                await this._waitForFile(safeScene.image_path);
            }
            if (safeScene.video_path && !this._isValidHttpUrl(safeScene.video_path)) {
                await this._waitForFile(safeScene.video_path);
            }

            const assetKey = safeScene.video_path || safeScene.image_path || `placeholder-${safeScene.scene_id}`;
            if (usedAssets.has(assetKey)) {
                safeScene.image_path = await this._createPlaceholder(projectId, safeScene.scene_id);
                safeScene.video_path = null;
            }
            usedAssets.add(assetKey);
            sanitizedScenes.push(safeScene);
        }
        return sanitizedScenes;
    }

    static _chunkScenes(scenes) {
        const chunks = [];
        let current = [];
        let currentDuration = 0;

        for (const scene of scenes) {
            const duration = Number(scene.duration || 3);
            if (current.length > 0 && currentDuration + duration > 300) {
                chunks.push(current);
                current = [];
                currentDuration = 0;
            }
            current.push(scene);
            currentDuration += duration;
        }

        if (current.length > 0) {
            chunks.push(current);
        }
        return chunks;
    }

    static async _renderSegment(remotionDir, entryFile, propsPath, outputPath) {
        const args = [
            'remotion',
            'render',
            entryFile,
            'CinematicVideo',
            outputPath,
            '--props',
            propsPath,
            '--bundle-cache=false',
        ];

        await new Promise((resolve, reject) => {
            const child = spawn('npx', args, {
                cwd: remotionDir,
                shell: process.platform === 'win32',
                env: { ...process.env },
            });

            let stderr = '';
            child.stdout.on('data', (chunk) => process.stdout.write(`[Remotion] ${chunk.toString()}`));
            child.stderr.on('data', (chunk) => {
                const text = chunk.toString();
                stderr += text;
                process.stderr.write(`[Remotion] ${text}`);
            });
            child.on('error', (error) => reject(new Error(`Failed to start Remotion: ${error.message}`)));
            child.on('close', async (code) => {
                const exists = await fs.pathExists(outputPath);
                if (code !== 0 || !exists) {
                    reject(new Error(`Remotion render failed (${code}). ${stderr.slice(-500)}`));
                    return;
                }
                resolve();
            });
        });
    }

    static async _stitchSegments(projectDir, segments, outputPath) {
        const concatPath = path.resolve(projectDir, 'segments', 'concat.txt');
        const concatContent = segments.map((segment) => `file '${segment.replace(/'/g, "'\\''")}'`).join('\n');
        await fs.writeFile(concatPath, concatContent, 'utf8');

        await new Promise((resolve, reject) => {
            const child = spawn(
                'ffmpeg',
                ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c:v', 'libx264', '-c:a', 'aac', outputPath],
                {
                    cwd: projectDir,
                    shell: process.platform === 'win32',
                }
            );
            let stderr = '';
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            child.on('error', (error) => reject(new Error(`Failed to stitch segments: ${error.message}`)));
            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Segment stitching failed: ${stderr.slice(-500)}`));
                    return;
                }
                resolve();
            });
        });
    }

    static _durationToFrames(durationSec, fps = 30) {
        return Math.floor((durationSec || 0) * fps);
    }

    static async _isUsableFile(filePath) {
        if (!await fs.pathExists(filePath)) return false;
        const stat = await fs.stat(filePath);
        return stat.size > 0;
    }

    static async _waitForFile(filePath, retries = 10, delay = 200) {
        for (let i = 0; i < retries; i += 1) {
            if (filePath && require('fs').existsSync(filePath)) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        return false;
    }

    static _isValidHttpUrl(value) {
        if (typeof value !== 'string' || value.length === 0) return false;
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    static _buildMusicUrl(musicPath, baseUrl, projectId) {
        if (this._isValidHttpUrl(musicPath)) return musicPath;
        if (musicPath && projectId) {
            const normalized = musicPath.split(path.sep).join('/');
            const projectIndex = normalized.lastIndexOf(`${projectId}/`);
            if (projectIndex >= 0) {
                const relativePath = normalized.slice(projectIndex + projectId.length + 1);
                return `${baseUrl}/videos/${projectId}/${relativePath}`;
            }
        }
        if (musicPath && fs.existsSync(musicPath)) return `${baseUrl}/assets/music/${path.basename(musicPath)}`;
        return `${baseUrl}/assets/music/cinematic.mp3`;
    }

    static _blankImageUrl() {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGBgAAAABAABJwc5IQAAAABJRU5ErkJggg==';
    }

    static async _createPlaceholder(projectId, sceneId) {
        const imgDir = path.resolve(PROJECTS_ROOT, projectId, 'images');
        await fs.ensureDir(imgDir);
        const placeholderPath = path.resolve(imgDir, `scene_${String(sceneId).padStart(2, '0')}_v1.png`);
        await fs.writeFile(
            placeholderPath,
            Buffer.from([
                0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
                0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
                0x54, 0x08, 0xd7, 0x63, 0x60, 0x60, 0x60, 0x00,
                0x00, 0x00, 0x04, 0x00, 0x01, 0x27, 0x07, 0x39,
                0x21, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
                0x44, 0xae, 0x42, 0x60, 0x82,
            ])
        );
        return placeholderPath;
    }
}

module.exports = RenderService;
