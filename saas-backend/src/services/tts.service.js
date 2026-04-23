const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

dotenv.config();

/**
 * TTS Service
 * Handles NVIDIA Cloud Functions TTS with SSML and a guaranteed silent WAV fallback.
 * The pipeline will NEVER crash due to TTS failure — a valid silent audio file is
 * written as last resort so Remotion can always render.
 */
class TTSService {
    /**
     * Converts narration to high-quality audio with emotional range.
     * @param {string} projectId - Unique ID for the project.
     * @param {Object} scene - Scene object containing narration and mood.
     * @returns {Promise<Object>} - { filePath, duration }
     */
    static async generateAudio(projectId, scene) {
        const { scene_id, narration, mood } = scene;
        const projectDir = path.join(process.cwd(), 'projects', projectId, 'audio');
        await fs.ensureDir(projectDir);

        const fileName = `scene_${String(scene_id).padStart(2, '0')}_voice.wav`;
        const filePath = path.join(projectDir, fileName);

        const ssml = this._wrapSSML(narration || '', mood);

        // 1. Try NVIDIA TTS (Primary)
        try {
            await this._generateNvidia(ssml, filePath, mood);
            const duration = this._getAudioDuration(filePath);
            console.log(`[TTS] Scene ${scene_id}: NVIDIA success — ${duration.toFixed(2)}s`);
            return { filePath, duration };
        } catch (error) {
            console.warn(`[TTS] Scene ${scene_id}: NVIDIA failed — ${error.message}`);
        }

        // 2. Fallback: Use background music instead of silence
        //    This ensures the video ALWAYS has audible content
        console.warn(`[TTS] Scene ${scene_id}: Using background music as audio fallback.`);
        const words = (narration || '').split(/\s+/).length;
        const estimatedDuration = Math.max(3.0, Math.min(6.0, words / 2.5));

        // Try to copy the cinematic music file as scene audio
        const musicFallbackPath = path.join(process.cwd(), 'assets', 'music', 'cinematic.mp3');
        if (fs.existsSync(musicFallbackPath)) {
            const fallbackMp3 = musicFallbackPath;
            const fallbackWav = filePath.replace('.wav', '.mp3');
            await fs.copy(fallbackMp3, fallbackWav);
            console.log(`[TTS] Scene ${scene_id}: ✅ Music fallback applied — ${estimatedDuration.toFixed(2)}s`);
            return { filePath: fallbackWav, duration: estimatedDuration };
        }

        // Absolute last resort: silent WAV (should rarely happen)
        console.warn(`[TTS] Scene ${scene_id}: No music file found. Writing silent WAV.`);
        await this._writeSilentWav(filePath, estimatedDuration);
        const actualDuration = this._getAudioDuration(filePath);
        console.log(`[TTS] Scene ${scene_id}: Silent WAV — ${actualDuration.toFixed(2)}s`);
        return { filePath, duration: actualDuration };
    }

    /**
     * Wraps text in SSML based on mood.
     */
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

        // Sanitize text for SSML
        const safe = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        return `<speak><prosody ${prosody}>${safe}</prosody></speak>`;
    }

    /**
     * NVIDIA TTS via NVCF
     */
    static async _generateNvidia(ssml, outPath, mood) {
        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) throw new Error('NVIDIA_API_KEY not configured');

        const voiceMap = {
            epic: 'English-US.Male-1',
            mysterious: 'English-US.Female-1',
            energetic: 'English-US.Male-1',
            somber: 'English-US.Female-1',
            calm: 'English-US.Female-1',
            default: 'English-US.Male-1',
        };

        const voice = voiceMap[mood] || voiceMap['default'];

        const response = await axios.post(
            'https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/0149dedb-2be8-4195-b9a0-e57e0e14f972',
            {
                text: ssml,
                voice: voice,
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
    }

    /**
     * Writes a valid silent WAV file so Remotion can always render.
     * WAV spec: RIFF header + fmt chunk + data chunk.
     * @param {string} filePath - Output path.
     * @param {number} durationSec - Duration of silence in seconds.
     */
    static async _writeSilentWav(filePath, durationSec) {
        const sampleRate = 22050;
        const numChannels = 1;
        const bitsPerSample = 16;
        const numSamples = Math.floor(sampleRate * durationSec);
        const dataSize = numSamples * numChannels * (bitsPerSample / 8);
        const totalSize = 44 + dataSize;

        const buffer = Buffer.alloc(totalSize);

        // RIFF chunk descriptor
        buffer.write('RIFF', 0, 'ascii');
        buffer.writeUInt32LE(36 + dataSize, 4);
        buffer.write('WAVE', 8, 'ascii');

        // fmt sub-chunk
        buffer.write('fmt ', 12, 'ascii');
        buffer.writeUInt32LE(16, 16);          // sub-chunk size
        buffer.writeUInt16LE(1, 20);           // PCM format
        buffer.writeUInt16LE(numChannels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
        buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);              // block align
        buffer.writeUInt16LE(bitsPerSample, 34);

        // data sub-chunk
        buffer.write('data', 36, 'ascii');
        buffer.writeUInt32LE(dataSize, 40);
        // Remaining bytes are already zeroed (silence)

        await fs.writeFile(filePath, buffer);
        console.log(`[TTS] Silent WAV written: ${filePath} (${durationSec.toFixed(2)}s)`);
    }

    /**
     * Uses ffprobe to get audio duration. Returns estimate on failure.
     */
    static _getAudioDuration(filePath) {
        try {
            const output = execSync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
                { encoding: 'utf8', timeout: 8000 }
            );
            const dur = parseFloat(output.trim());
            return isNaN(dur) || dur <= 0 ? 4.0 : dur;
        } catch {
            // ffprobe not available — estimate from file size
            try {
                const stat = require('fs').statSync(filePath);
                // WAV at 22050Hz mono 16-bit = 44100 bytes/sec
                return Math.max(1.0, (stat.size - 44) / 44100);
            } catch {
                return 4.0;
            }
        }
    }
}

module.exports = TTSService;
