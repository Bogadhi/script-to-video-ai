const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const PROJECTS_ROOT = path.resolve(BACKEND_ROOT, 'projects');
const TARGET_LOUDNORM = 'loudnorm=I=-16:TP=-1.5:LRA=11';
const DEFAULT_DUCKING_RATIO = 0.32;

class AudioService {
    static async prepareRenderAudio(projectId, manifest = {}) {
        const inputScenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
        const normalizedScenes = await this._normalizeSceneAudio(projectId, inputScenes);
        const masteredMusicPath = await this._prepareMusicTrack(
            projectId,
            manifest.musicPath || manifest.music_path || '',
            normalizedScenes
        );

        return {
            scenes: normalizedScenes,
            musicPath: masteredMusicPath,
            metadata: {
                normalizedSceneCount: normalizedScenes.filter((scene) => Boolean(scene.audio_path)).length,
                duckedMusicPath: masteredMusicPath || '',
            },
        };
    }

    static async _normalizeSceneAudio(projectId, scenes) {
        const masteredDir = path.resolve(PROJECTS_ROOT, projectId, 'audio', 'mastered');
        await fs.ensureDir(masteredDir);

        const normalizedScenes = [];
        for (const scene of scenes) {
            const localAudioPath = this._resolveLocalFile(scene.audio_path);
            if (!localAudioPath) {
                normalizedScenes.push({ ...scene });
                continue;
            }

            const extension = path.extname(localAudioPath) || '.wav';
            const masteredPath = path.resolve(
                masteredDir,
                `scene_${String(scene.scene_id).padStart(2, '0')}_voice_master${extension}`
            );

            try {
                await this._normalizeAudioFile(localAudioPath, masteredPath, scene.duration);
                normalizedScenes.push({ ...scene, audio_path: masteredPath });
            } catch (error) {
                console.warn(`[Audio] Scene ${scene.scene_id}: normalization fallback - ${error.message}`);
                await this._copyIfMissing(localAudioPath, masteredPath);
                normalizedScenes.push({ ...scene, audio_path: masteredPath });
            }
        }

        return normalizedScenes;
    }

    static async _prepareMusicTrack(projectId, musicPath, scenes) {
        const localMusicPath = this._resolveLocalFile(musicPath);
        if (!localMusicPath) {
            return musicPath || '';
        }

        const masteredDir = path.resolve(PROJECTS_ROOT, projectId, 'audio', 'mastered');
        await fs.ensureDir(masteredDir);

        const normalizedMusicPath = path.resolve(masteredDir, `music_bed_master${path.extname(localMusicPath) || '.mp3'}`);
        try {
            await this._normalizeAudioFile(localMusicPath, normalizedMusicPath);
        } catch (error) {
            console.warn(`[Audio] Music normalization fallback - ${error.message}`);
            await this._copyIfMissing(localMusicPath, normalizedMusicPath);
        }

        const narrationBedPath = await this._buildNarrationBed(projectId, scenes);
        if (!narrationBedPath) {
            return normalizedMusicPath;
        }

        const duckedMusicPath = path.resolve(masteredDir, 'music_ducked_master.wav');
        try {
            const duckingStrength = this._resolveDuckingStrength();
            const duckedVolumeFloor = Math.max(0.25, Math.min(0.4, 1 - duckingStrength));
            const args = [
                '-y',
                '-i',
                normalizedMusicPath,
                '-i',
                narrationBedPath,
                '-filter_complex',
                [
                    `[0:a]${TARGET_LOUDNORM}[music]`,
                    `[1:a]highpass=f=120,acompressor=threshold=-24dB:ratio=2.5:attack=5:release=120[speech]`,
                    `[music][speech]sidechaincompress=threshold=0.015:ratio=12:attack=20:release=250:level_sc=1[ducked]`,
                    `[ducked]volume=${duckedVolumeFloor.toFixed(2)},${TARGET_LOUDNORM},alimiter=limit=0.95[outa]`,
                ].join(';'),
                '-map',
                '[outa]',
                duckedMusicPath,
            ];
            await this._runFfmpeg(args);
            return duckedMusicPath;
        } catch (error) {
            console.warn(`[Audio] Sidechain ducking fallback - ${error.message}`);
        }

        const fallbackMusicPath = path.resolve(masteredDir, 'music_ducked_static.wav');
        try {
            await this._runFfmpeg([
                '-y',
                '-i',
                normalizedMusicPath,
                '-af',
                `volume=${DEFAULT_DUCKING_RATIO},${TARGET_LOUDNORM},alimiter=limit=0.95`,
                fallbackMusicPath,
            ]);
            return fallbackMusicPath;
        } catch (error) {
            console.warn(`[Audio] Static music attenuation fallback - ${error.message}`);
            return normalizedMusicPath;
        }
    }

    static async _buildNarrationBed(projectId, scenes) {
        const localScenes = (scenes || []).filter((scene) => this._resolveLocalFile(scene.audio_path));
        if (localScenes.length === 0) {
            return '';
        }

        const masteredDir = path.resolve(PROJECTS_ROOT, projectId, 'audio', 'mastered');
        await fs.ensureDir(masteredDir);

        const narrationBedPath = path.resolve(masteredDir, 'narration_bed.wav');
        const args = ['-y'];
        const filterParts = [];
        const mixLabels = [];
        let cumulativeDelayMs = 0;

        localScenes.forEach((scene, index) => {
            const audioPath = this._resolveLocalFile(scene.audio_path);
            args.push('-i', audioPath);
            const duration = Math.max(1, Number(scene.duration) || this._estimateDuration(audioPath));
            filterParts.push(
                `[${index}:a]atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.max(0, Math.floor(cumulativeDelayMs))}:all=1[a${index}]`
            );
            mixLabels.push(`[a${index}]`);
            cumulativeDelayMs += duration * 1000;
        });

        filterParts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0,${TARGET_LOUDNORM},alimiter=limit=0.95[outa]`);
        args.push('-filter_complex', filterParts.join(';'), '-map', '[outa]', narrationBedPath);

        try {
            await this._runFfmpeg(args);
            return narrationBedPath;
        } catch (error) {
            console.warn(`[Audio] Narration bed fallback - ${error.message}`);
            return '';
        }
    }

    static async _normalizeAudioFile(inputPath, outputPath, targetDurationSec = null) {
        const afChain = [
            'silenceremove=start_periods=1:start_silence=0.10:start_threshold=-40dB:stop_periods=1:stop_silence=0.12:stop_threshold=-40dB',
            'apad=pad_dur=0.08',
            TARGET_LOUDNORM,
            'alimiter=limit=0.95',
        ];
        const args = ['-y', '-i', inputPath];
        if (targetDurationSec && Number.isFinite(Number(targetDurationSec))) {
            args.push('-t', String(Math.max(0.5, Number(targetDurationSec))));
        }
        args.push('-af', afChain.join(','), outputPath);
        await this._runFfmpeg(args);
    }

    static _resolveDuckingStrength() {
        const configured = Number(process.env.AUDIO_DUCKING_STRENGTH);
        if (Number.isFinite(configured)) {
            return Math.max(0.6, Math.min(0.75, configured));
        }
        return 0.68;
    }

    static _resolveLocalFile(filePath) {
        if (typeof filePath !== 'string' || filePath.trim().length === 0) {
            return '';
        }

        if (/^https?:\/\//i.test(filePath)) {
            return '';
        }

        const resolved = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(BACKEND_ROOT, filePath);

        return fs.existsSync(resolved) ? resolved : '';
    }

    static async _copyIfMissing(sourcePath, targetPath) {
        await fs.ensureDir(path.dirname(targetPath));
        await fs.copy(sourcePath, targetPath, { overwrite: true });
    }

    static async _runFfmpeg(args) {
        await new Promise((resolve, reject) => {
            const child = spawn('ffmpeg', args, {
                cwd: BACKEND_ROOT,
                shell: process.platform === 'win32',
            });

            let stderr = '';
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('error', (error) => {
                reject(new Error(`ffmpeg unavailable: ${error.message}`));
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(stderr.slice(-400) || `ffmpeg exited with code ${code}`));
                    return;
                }
                resolve();
            });
        });
    }

    static _estimateDuration(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return Math.max(3, Math.min(6, stats.size / 48000));
        } catch {
            return 4;
        }
    }
}

module.exports = AudioService;
