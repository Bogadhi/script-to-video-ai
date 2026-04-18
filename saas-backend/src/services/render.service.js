const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const PROJECTS_ROOT = path.resolve(BACKEND_ROOT, 'projects');

class RenderService {
    static async render(projectId, manifest) {
        const remotionDir = path.resolve(BACKEND_ROOT, 'remotion');
        const entryFile = path.resolve(remotionDir, 'src', 'index.ts');
        const projectDir = path.resolve(PROJECTS_ROOT, projectId);
        const propsPath = path.resolve(projectDir, 'props.json');
        const outputPath = path.resolve(projectDir, 'final_video.mp4');

        await fs.ensureDir(projectDir);

        const baseUrl = process.env.BASE_URL || 'http://localhost:5002';

        if (!manifest.scenes || manifest.scenes.length < 3) {
            throw new Error("Insufficient scenes generated");
        }

        const sanitizedScenes = [];
        for (const scene of manifest.scenes || []) {
            const safeScene = { ...scene };

            if (!safeScene.narration) safeScene.narration = '';
            if (typeof safeScene.duration !== 'number' || safeScene.duration <= 0) {
                safeScene.duration = 3;
            }

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

            console.log('[FILE READY]', safeScene.scene_id, safeScene.video_path || safeScene.image_path);
            sanitizedScenes.push(safeScene);
        }

        console.log('[SANITIZED SCENES]', sanitizedScenes.length);

        let musicPath = manifest.music_path || '';
        if (musicPath && !fs.existsSync(musicPath) && !this._isValidHttpUrl(musicPath)) {
            musicPath = '';
        }

        const musicUrl = this._buildMusicUrl(musicPath, baseUrl);

        const totalDuration = sanitizedScenes.reduce((acc, s) => acc + (s.duration || 3), 0);
        console.log('[TOTAL SCENES]', sanitizedScenes.length);
        console.log('[TOTAL DURATION]', totalDuration);

        const renderProps = {
            scenes: sanitizedScenes.map((scene) => {
                const videoUrl = scene.video_path || '';
                const imageUrl = scene.image_path || '';
                
                const finalVideoUrl = videoUrl || '';
                const finalImageUrl = finalVideoUrl ? null : (imageUrl || this._blankImageUrl());

                const audioUrl = scene.audio_path || '';

                return {
                    scene_id: scene.scene_id,
                    image_path: finalImageUrl,
                    video_path: finalVideoUrl,
                    audio_path: audioUrl,
                    duration: scene.duration,
                    motion: scene.motion || { startScale: 1, endScale: 1.1, xStart: 0, xEnd: 12, yStart: 0, yEnd: -8 },
                };
            }),
            musicPath: musicUrl,
        };

        fs.writeFileSync(propsPath, JSON.stringify(renderProps, null, 2), 'utf8');

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

        return new Promise((resolve, reject) => {
            const child = spawn('npx', args, {
                cwd: remotionDir,
                shell: process.platform === 'win32',
                env: { ...process.env },
            });

            let stderr = '';

            child.stdout.on('data', (chunk) => {
                process.stdout.write(`[Remotion] ${chunk.toString()}`);
            });

            child.stderr.on('data', (chunk) => {
                const text = chunk.toString();
                stderr += text;
                process.stderr.write(`[Remotion] ${text}`);
            });

            child.on('error', (err) => {
                reject(new Error(`Failed to start Remotion: ${err.message}`));
            });

            child.on('close', async (code) => {
                const exists = await fs.pathExists(outputPath);
                const size = exists ? (await fs.stat(outputPath)).size : 0;

                if (code !== 0) {
                    return reject(new Error(`Remotion render failed (exit code ${code}). Last stderr:\n${stderr.slice(-1000)}`));
                }

                if (!exists || size === 0) {
                    return reject(new Error('Remotion exited 0 but no output file was created.'));
                }

                resolve(outputPath);
            });
        });
    }

    static async _waitForFile(filePath, retries = 10, delay = 200) {
        for (let i = 0; i < retries; i++) {
            if (filePath && require('fs').existsSync(filePath)) {
                return true;
            }
            await new Promise((res) => setTimeout(res, delay));
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

    static _buildSceneImageUrl(baseUrl, projectId, imagePath) {
        if (!imagePath) return '';
        if (this._isValidHttpUrl(imagePath)) return imagePath;
        return `${baseUrl}/videos/${projectId}/images/${path.basename(imagePath)}`;
    }

    static _buildSceneVideoUrl(baseUrl, projectId, videoPath) {
        if (!videoPath) return '';
        if (this._isValidHttpUrl(videoPath)) return videoPath;
        return `${baseUrl}/videos/${projectId}/videos/${path.basename(videoPath)}`;
    }

    static _buildMusicUrl(musicPath, baseUrl) {
        if (this._isValidHttpUrl(musicPath)) {
            return musicPath;
        }
        if (musicPath && fs.existsSync(musicPath)) {
            return `${baseUrl}/assets/music/${path.basename(musicPath)}`;
        }
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
