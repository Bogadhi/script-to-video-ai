const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const dotenv = require('dotenv');
const MetricsService = require('./metrics.service');

dotenv.config();

class TTSService {
    static async generateAudio(projectId, scene) {
        const { scene_id, narration, mood } = scene;
        const projectDir = path.join(process.cwd(), 'projects', projectId, 'audio');
        await fs.ensureDir(projectDir);

        const fileName = `scene_${String(scene_id).padStart(2, '0')}_voice.wav`;
        const filePath = path.join(projectDir, fileName);
        const ssml = this._wrapSSML(narration || '', mood);

        try {
            await this._generateNvidia(projectId, ssml, filePath, mood);
            await this._trimSilence(filePath);
            const duration = this._getAudioDuration(filePath);
            console.log(`[TTS] Scene ${scene_id}: NVIDIA success - ${duration.toFixed(2)}s`);
            return { filePath, duration };
        } catch (error) {
            console.warn(`[TTS] Scene ${scene_id}: NVIDIA failed - ${error.message}`);
        }

        console.warn(`[TTS] Scene ${scene_id}: Using background music as audio fallback.`);
        const words = (narration || '').split(/\s+/).filter(Boolean).length;
        const estimatedDuration = Math.max(3.0, Math.min(6.0, words / 2.5));
        const musicFallbackPath = path.join(process.cwd(), 'assets', 'music', 'cinematic.mp3');
        if (fs.existsSync(musicFallbackPath)) {
            const fallbackMp3 = filePath.replace('.wav', '.mp3');
            await fs.copy(musicFallbackPath, fallbackMp3);
            return { filePath: fallbackMp3, duration: estimatedDuration };
        }

        await this._writeSilentWav(filePath, estimatedDuration);
        return { filePath, duration: this._getAudioDuration(filePath) };
    }

    static _wrapSSML(text, mood) {
        let prosody = 'rate="medium" pitch="medium" volume="medium"';
        switch (mood) {
            case 'mysterious':
                prosody = 'rate="slow" pitch="low" volume="soft"';
                break;
            case 'epic':
                prosody = 'rate="slow" pitch="medium" volume="loud"';
                break;
            case 'energetic':
                prosody = 'rate="fast" pitch="high" volume="loud"';
                break;
            case 'somber':
                prosody = 'rate="slow" pitch="low" volume="soft"';
                break;
            case 'calm':
                prosody = 'rate="medium" pitch="low" volume="medium"';
                break;
        }

        const safe = String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        return `<speak><prosody ${prosody}>${safe}</prosody></speak>`;
    }

    static async _generateNvidia(projectId, ssml, outPath, mood) {
        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) {
            throw new Error('NVIDIA_API_KEY not configured');
        }

        const voiceMap = {
            epic: 'English-US.Male-1',
            mysterious: 'English-US.Female-1',
            energetic: 'English-US.Male-1',
            somber: 'English-US.Female-1',
            calm: 'English-US.Female-1',
            default: 'English-US.Male-1',
        };

        const response = await axios.post(
            'https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/0149dedb-2be8-4195-b9a0-e57e0e14f972',
            {
                text: ssml,
                voice: voiceMap[mood] || voiceMap.default,
                encoding: 'LINEAR_PCM',
                sample_rate_hz: 22050,
                language_code: 'en-US',
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    Accept: 'audio/wav',
                },
                responseType: 'arraybuffer',
                timeout: 20000,
            }
        );

        if (!response.data || response.data.byteLength < 100) {
            throw new Error('NVIDIA returned empty audio buffer');
        }

        await fs.writeFile(outPath, Buffer.from(response.data));
        MetricsService.logApiCost(projectId, 'nvidia', {
            ...MetricsService.estimateNvidiaTtsCost(),
            meta: { voice: voiceMap[mood] || voiceMap.default },
        });
    }

    static async _trimSilence(filePath) {
        const trimmedPath = filePath.replace(/(\.[^.]+)$/, '_trimmed$1');
        const ffmpeg = spawnSync(
            'ffmpeg',
            [
                '-y',
                '-i',
                filePath,
                '-af',
                'silenceremove=start_periods=1:start_silence=0.10:start_threshold=-40dB:stop_periods=1:stop_silence=0.15:stop_threshold=-40dB,apad=pad_dur=0.08',
                trimmedPath,
            ],
            { encoding: 'utf8', windowsHide: true }
        );

        if (ffmpeg.status === 0 && fs.existsSync(trimmedPath)) {
            await fs.move(trimmedPath, filePath, { overwrite: true });
        }
    }

    static async _writeSilentWav(filePath, durationSec) {
        const sampleRate = 22050;
        const numChannels = 1;
        const bitsPerSample = 16;
        const numSamples = Math.floor(sampleRate * durationSec);
        const dataSize = numSamples * numChannels * (bitsPerSample / 8);
        const totalSize = 44 + dataSize;
        const buffer = Buffer.alloc(totalSize);

        buffer.write('RIFF', 0, 'ascii');
        buffer.writeUInt32LE(36 + dataSize, 4);
        buffer.write('WAVE', 8, 'ascii');
        buffer.write('fmt ', 12, 'ascii');
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20);
        buffer.writeUInt16LE(numChannels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
        buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
        buffer.writeUInt16LE(bitsPerSample, 34);
        buffer.write('data', 36, 'ascii');
        buffer.writeUInt32LE(dataSize, 40);

        await fs.writeFile(filePath, buffer);
    }

    static _getAudioDuration(filePath) {
        try {
            const output = execSync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
                { encoding: 'utf8', timeout: 8000 }
            );
            const duration = parseFloat(output.trim());
            return Number.isFinite(duration) && duration > 0 ? duration : 4.0;
        } catch {
            try {
                const stat = require('fs').statSync(filePath);
                return Math.max(1.0, (stat.size - 44) / 44100);
            } catch {
                return 4.0;
            }
        }
    }
}

module.exports = TTSService;
