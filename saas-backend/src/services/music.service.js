const fs = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');

class MusicService {
    static async getMusicTrack(mood, totalDurationSec = 0, projectId = '') {
        const musicDir = path.join(process.cwd(), 'assets', 'music');
        const moodMap = {
            epic: 'cinematic.mp3',
            mysterious: 'cinematic.mp3',
            calm: 'calm.mp3',
            somber: 'calm.mp3',
            energetic: 'energetic.mp3',
            default: 'cinematic.mp3',
        };

        const preferred = moodMap[(mood || '').toLowerCase()] || moodMap.default;
        const candidates = this._collectCandidates(musicDir, preferred);
        if (candidates.length === 0) {
            return null;
        }

        let selected = null;
        for (const trackPath of candidates) {
            const duration = this._getDurationSeconds(trackPath);
            if (!duration || duration < 45) {
                continue;
            }
            selected = { trackPath, duration };
            break;
        }

        if (!selected) {
            selected = { trackPath: candidates[0], duration: this._getDurationSeconds(candidates[0]) || 0 };
        }

        const targetDuration = Math.max(0, Number(totalDurationSec) || 0);
        if (targetDuration <= 0 || selected.duration >= targetDuration + 1) {
            return selected.trackPath;
        }

        const loopedPath = await this._buildLoopedTrack(selected.trackPath, targetDuration + 2, projectId);
        return loopedPath || selected.trackPath;
    }

    static _collectCandidates(musicDir, preferred) {
        if (!fs.existsSync(musicDir)) {
            return [];
        }

        const available = fs
            .readdirSync(musicDir)
            .filter((f) => /\.(mp3|aac)$/i.test(f))
            .map((f) => path.join(musicDir, f));

        const preferredPath = path.join(musicDir, preferred);
        const ordered = [];
        if (fs.existsSync(preferredPath)) {
            ordered.push(preferredPath);
        }
        for (const item of available) {
            if (!ordered.includes(item)) {
                ordered.push(item);
            }
        }
        return ordered;
    }

    static _getDurationSeconds(filePath) {
        const probe = spawnSync(
            'ffprobe',
            ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', filePath],
            { encoding: 'utf8', windowsHide: true }
        );

        if (probe.status !== 0) {
            return 0;
        }

        const duration = parseFloat((probe.stdout || '').trim());
        return Number.isFinite(duration) ? duration : 0;
    }

    static async _buildLoopedTrack(inputPath, targetDurationSec, projectId) {
        const safeProjectId = projectId || 'runtime';
        const outDir = path.join(process.cwd(), 'projects', safeProjectId, 'audio');
        await fs.ensureDir(outDir);

        const outPath = path.join(outDir, `music_loop_${Math.ceil(targetDurationSec)}s.mp3`);

        const ffmpeg = spawnSync(
            'ffmpeg',
            [
                '-y',
                '-stream_loop',
                '-1',
                '-i',
                inputPath,
                '-t',
                String(targetDurationSec),
                '-c:a',
                'libmp3lame',
                '-q:a',
                '3',
                outPath,
            ],
            { encoding: 'utf8', windowsHide: true }
        );

        if (ffmpeg.status === 0 && fs.existsSync(outPath)) {
            return outPath;
        }

        try {
            const source = await fs.readFile(inputPath);
            if (!source.length) {
                return null;
            }
            const originalDuration = this._getDurationSeconds(inputPath);
            const fallbackDuration = originalDuration > 0 ? originalDuration : 30;
            const repeats = Math.max(2, Math.ceil(targetDurationSec / fallbackDuration));
            const chunks = [];
            for (let i = 0; i < repeats; i++) {
                chunks.push(source);
            }
            await fs.writeFile(outPath, Buffer.concat(chunks));
            return outPath;
        } catch {
            return null;
        }
    }
}

module.exports = MusicService;
