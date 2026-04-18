const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

class VisualService {
    static usedAssets = new Set();
    static usedVideoIds = new Set();

    static _isDuplicateOrSimilar(url) {
        if (!this.usedAssets) this.usedAssets = new Set();
        if (!this.usedVideoIds) this.usedVideoIds = new Set();

        if (this.usedAssets.has(url)) return true;
        
        const idMatch = url.match(/\d{5,}/);
        if (idMatch && this.usedVideoIds.has(idMatch[0])) {
            return true;
        }
        
        return false;
    }

    static _markAsUsed(url) {
        if (!this.usedAssets) this.usedAssets = new Set();
        if (!this.usedVideoIds) this.usedVideoIds = new Set();
        
        this.usedAssets.add(url);
        const idMatch = url.match(/\d{5,}/);
        if (idMatch) {
            this.usedVideoIds.add(idMatch[0]);
        }
    }

    static async generateImage(projectId, scene) {
        if (!this.usedAssets) {
            this.usedAssets = new Set();
            this.usedVideoIds = new Set();
            this.usedPromptHashes = new Set();
            this.usedImageHashes = new Set();
            this.previousSceneContext = null;
        }

        if (typeof this.previousSceneContext === 'undefined') {
            this.previousSceneContext = null;
        }

        const { scene_id, visual_prompt, keywords, domain } = scene;
        const projectDir = path.join(process.cwd(), 'projects', projectId, 'images');
        await fs.ensureDir(projectDir);

        const uniqueTS = Date.now().toString().slice(-6);
        const fileName = `scene_${String(scene_id).padStart(2, '0')}_v${uniqueTS}.png`;
        const filePath = path.join(projectDir, fileName);

        const fullSubjects = (keywords && keywords.length > 0)
            ? keywords.filter((k) => !['cinematic', 'beautiful', 'amazing', 'epic', 'dramatic', 'visual'].includes(String(k).toLowerCase()))
            : [];

        const stageSequence = ((scene_id || 1) - 1) % 5;
        if (stageSequence === 3) {
            scene.motion_type = "dynamic";
        } else {
            scene.motion_type = "cinematic";
        }

        const subjectPool = fullSubjects.length > 0 ? fullSubjects : ["visual"];
        const stage = stageSequence;
        let activeSubjects = subjectPool;

        if (stage === 0) {
            activeSubjects = subjectPool;
        } else if (stage === 1) {
            activeSubjects = [subjectPool[0]];
        } else if (stage === 2) {
            activeSubjects = [subjectPool[1] || subjectPool[0]];
        } else if (stage === 3) {
            activeSubjects = [subjectPool[2] || subjectPool[0]];
        } else {
            activeSubjects = subjectPool.slice(0, 2);
        }
        
        scene.activeSubjects = activeSubjects;

        const resolvedDomain = this._resolveDomain(domain, visual_prompt, activeSubjects);
        const searchQuery = this._buildSearchQuery(activeSubjects, resolvedDomain, scene);

        console.log('[ACTIVE SUBJECTS]', activeSubjects);
        console.log('[QUERY]', searchQuery);
        console.log('[DOMAIN]', resolvedDomain);

        if (resolvedDomain === 'nature') {
            const videoUrl = await this.fetchVideo(searchQuery, activeSubjects, resolvedDomain);
            if (videoUrl) {
                scene.video_path = videoUrl;
                scene.image_path = null;
                console.log('[VISUAL RESULT]', videoUrl);
                return videoUrl;
            }
        }

        const sdImagePath = await this._generateImageFallback(filePath, searchQuery, activeSubjects, resolvedDomain, scene);
        if (sdImagePath) {
            this.previousSceneContext = `${activeSubjects.join(', ')}, same environment, same location, consistent lighting`;
            scene.video_path = null;
            scene.image_path = sdImagePath;
            console.log('[VISUAL RESULT]', 'SD IMAGE');
            return sdImagePath;
        }

        await this._writeBlankFallback(filePath);
        console.log('[VISUAL RESULT]', 'DUMMY');
        scene.video_path = null;
        scene.image_path = filePath;
        return filePath;
    }

    static async fetchVideo(query, subjects, domain) {
        const pexelsVideo = await this._pexelsVideoSearch(query, subjects, domain);
        if (pexelsVideo) {
            return pexelsVideo;
        }

        const pixabayVideo = await this._pixabayVideoSearch(query, subjects, domain);
        if (pixabayVideo) {
            return pixabayVideo;
        }

        return null;
    }

    static async _generateImageFallback(filePath, query, coreSubjects, domain, scene) {
        const sdKey = process.env.STABLE_DIFFUSION_API_KEY;
        if (sdKey && sdKey !== 'your_sd_key_here') {
            try {
                let prompt = this._buildSdPrompt(coreSubjects, domain, scene);
                const negative = this._buildSdNegativePrompt(domain);

                let buffer = await this._generateWithSD(prompt, negative);
                if (buffer && this._validateImageContent(buffer)) {
                    if (!this.usedImageHashes) this.usedImageHashes = new Set();
                    const imgHash = buffer.slice(0, 200).toString('hex');

                    if (this.usedImageHashes.has(imgHash)) {
                        console.log('[VISUAL HASH] visual duplicate detected, regenerating...');
                        prompt += ", completely different composition, radically different angle, uniquely distinct framing, completely different visual layout";
                        buffer = await this._generateWithSD(prompt, negative);
                        if (!buffer || !this._validateImageContent(buffer)) {
                            return null;
                        }
                    }
                    this.usedImageHashes.add(buffer.slice(0, 200).toString('hex'));

                    await fs.writeFile(filePath, buffer);
                    return filePath;
                }
            } catch (err) {
                console.warn('[Visual] SD failed:', err.message);
            }
        }

        return null;
    }

    static async _pexelsVideoSearch(query, coreSubjects, domain) {
        const key = process.env.PEXELS_API_KEY;
        if (!key || key === 'your_pexels_key_here') return null;

        try {
            const response = await axios.get(
                `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=10`,
                {
                    headers: { Authorization: key },
                    timeout: 10000,
                }
            );

            const videos = response.data?.videos || [];
            for (const video of videos) {
                const match = (video.video_files || []).find((file) =>
                    file?.link &&
                    file?.file_type === 'video/mp4' &&
                    Number(file?.width) >= 1280
                );

                if (!match?.link) {
                    continue;
                }

                const validation = this.isValidVisual(video, query, coreSubjects, domain);
                if (validation.valid) {
                    if (this._isDuplicateOrSimilar(match.link)) {
                        console.log('[VISUAL REJECTED]', 'duplicate asset or similar id');
                        continue;
                    }
                    this._markAsUsed(match.link);
                    console.log('[VISUAL ACCEPTED]', match.link);
                    return match.link;
                }

                console.log('[VISUAL REJECTED]', validation.reason);
                console.log('[VISUAL REJECTED]', match.link);
            }
        } catch (err) {
            console.warn('[Visual] pexels video error:', err.message);
        }

        return null;
    }

    static async _pixabayVideoSearch(query, coreSubjects, domain) {
        const key = process.env.PIXABAY_API_KEY;
        if (!key) return null;

        try {
            const response = await axios.get(
                `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=10`,
                { timeout: 10000 }
            );

            const hits = response.data?.hits || [];
            for (const hit of hits) {
                const candidates = [
                    hit?.videos?.large,
                    hit?.videos?.medium,
                    hit?.videos?.small,
                    hit?.videos?.tiny,
                ];
                const match = candidates.find((video) => video?.url && Number(video?.width) >= 1280);

                if (!match?.url) {
                    continue;
                }

                const validation = this.isValidVisual(hit, query, coreSubjects, domain);
                if (validation.valid) {
                    if (this._isDuplicateOrSimilar(match.url)) {
                        console.log('[VISUAL REJECTED]', 'duplicate asset or similar id');
                        continue;
                    }
                    this._markAsUsed(match.url);
                    console.log('[VISUAL ACCEPTED]', match.url);
                    return match.url;
                }

                console.log('[VISUAL REJECTED]', validation.reason);
                console.log('[VISUAL REJECTED]', match.url);
            }
        } catch (err) {
            console.warn('[Visual] pixabay video error:', err.message);
        }

        return null;
    }

    static _buildSearchQuery(subjects, domain, scene) {
        const normalizedSubjects = (subjects || []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 3);
        const subjectsText = normalizedSubjects.join(' ').trim() || 'visual concept';
        
        let cameraInstruction = "cinematic";
        const focus = String(scene?.visual_focus || '').toLowerCase();
        if (focus.includes('aerial') || focus.includes('wide')) {
            cameraInstruction = "aerial wide view";
        } else if (focus.includes('close-up') || focus.includes('detail')) {
            cameraInstruction = "close up macro";
        } else if (focus.includes('medium')) {
            cameraInstruction = "medium framing";
        } else if (focus.includes('motion')) {
            cameraInstruction = "dynamic motion";
        }
        
        const envHint = domain === "finance" ? "finance market" : domain === "technology" ? "tech digital" : domain;
        
        return `${subjectsText} ${cameraInstruction} ${envHint}`.trim();
    }

    static _resolveDomain(domain, visualPrompt, subjects) {
        if (domain) {
            return domain;
        }

        const text = `${visualPrompt || ''} ${(subjects || []).join(' ')}`.toLowerCase();
        if (/finance|stock|investment|market|trading|economy/.test(text)) return 'finance';
        if (/tech|technology|ai|software|digital|interface|code/.test(text)) return 'technology';
        if (/travel|mountain|river|forest|nature|ocean|waterfall/.test(text)) return 'nature';
        return 'generic';
    }

    static isValidVisual(videoMeta, query, subjects, domain) {
        const text = JSON.stringify({
            url: videoMeta?.url,
            image: videoMeta?.image,
            video: videoMeta?.videos?.large?.url,
            tags: videoMeta?.tags,
            user: videoMeta?.user?.name,
            alt: videoMeta?.alt,
        }).toLowerCase();

        const normalizedSubjects = (subjects || []).map((s) => String(s).toLowerCase()).filter(Boolean);
        
        const matchCount = normalizedSubjects.filter((s) => text.includes(s)).length;
        const required = normalizedSubjects.length;
        console.log('[MATCH COUNT]', matchCount, '/', required);

        const minMatch = Math.max(1, Math.ceil(required * 0.5));

        if (required > 0 && matchCount < minMatch) {
            return {
                valid: false,
                reason: `insufficient subject match (requires at least ${minMatch})`,
            };
        }

        let domainMatch = true;
        if (domain === 'finance') {
            domainMatch = /(finance|stock|market|trading|business|economy)/.test(text);
        }
        if (domain === 'technology') {
            domainMatch = /(tech|digital|data|ai|code|software|system)/.test(text);
        }
        console.log('[DOMAIN CHECK]', domain, domainMatch);

        if (!domainMatch) {
            return {
                valid: false,
                reason: 'domain mismatch',
            };
        }

        const banned = domain === 'nature'
            ? ['person', 'people', 'face', 'portrait', 'indoor', 'building', 'city']
            : ['watermark', 'blurry', 'cartoon'];

        const bannedHit = banned.find((b) => text.includes(b));
        const hasBanned = Boolean(bannedHit);

        if (hasBanned) {
            return {
                valid: false,
                reason: `banned content: ${bannedHit}`,
            };
        }

        return {
            valid: true,
            reason: '',
        };
    }

    static usedPromptHashes = new Set();
    
    static _hashPrompt(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    static _buildSdPrompt(coreSubjects, domain, scene) {
        const activeArray = scene?.activeSubjects || coreSubjects;
        const subjects = activeArray.length > 0 ? activeArray.join(', ') : 'visual concept';
        
        const stage = ((scene?.scene_id || 1) - 1) % 5;
        
        let aspectInstruction = "vast environment, large scale composition";
        let visualDifference = "establishing shot";
        
        if (stage === 0) {
            aspectInstruction = "vast environment, large scale composition";
            visualDifference = "establishing shot";
        } else if (stage === 1) {
            aspectInstruction = "focused subject detail, macro textures";
            visualDifference = "detail shot";
        } else if (stage === 2) {
            aspectInstruction = "cinematic close framing, shallow depth";
            visualDifference = "intimate close-up";
        } else if (stage === 3) {
            aspectInstruction = "dynamic movement, motion realism";
            visualDifference = "dynamic motion shot";
        } else if (stage === 4) {
            aspectInstruction = "epic wide cinematic ending";
            visualDifference = "final cinematic wide shot";
        }
        
        let camera_instruction = "";
        if (stage === 0) {
            camera_instruction = "wide aerial shot, large landscape view";
        } else if (stage === 1) {
            camera_instruction = "medium landscape, environmental shot";
        } else if (stage === 2) {
            camera_instruction = "close detail, macro details, shallow depth of field";
        } else if (stage === 3) {
            camera_instruction = "motion shot, dynamic angle, motion blur perspective";
        } else if (stage === 4) {
            camera_instruction = "cinematic ending, epic wide composition";
        }

        camera_instruction += ", different angle, different composition, different perspective, different framing";

        const variation = [
            "different angle",
            "alternate perspective",
            "cinematic framing shift",
            "lens variation",
            "composition change"
        ][stage];

        const depthLayers = "foreground, midground, background depth composition";
        const realism = "natural lighting gradients, realistic shadows, volumetric light";
        const organic = "natural imperfections, organic environment variation";
        const motionContinuity = "cinematic motion continuity, natural temporal flow";
        
        let domainModifier = "";
        if (domain === 'nature') {
            domainModifier = ", cinematic travel photography, national geographic style";
        } else if (domain === 'finance') {
            domainModifier = ", modern corporate cinematic visual";
        } else if (domain === 'technology') {
            domainModifier = ", futuristic digital realism";
        }

        let environmentMotion = "";
        if (stage === 3) {
            environmentMotion += "flowing motion, moving elements, dynamic environment, temporal change";
        }
        const subjText = subjects.toLowerCase();
        if (subjText.includes('river')) {
            environmentMotion += (environmentMotion ? ", " : "") + "flowing water motion";
        }
        if (subjText.includes('sky') || subjText.includes('sunrise')) {
            environmentMotion += (environmentMotion ? ", " : "") + "moving clouds, changing light";
        }
        if (subjText.includes('forest')) {
            environmentMotion += (environmentMotion ? ", " : "") + "wind movement in trees";
        }
        if (environmentMotion) {
            environmentMotion = `, ${environmentMotion}`;
        }

        const moodSequence = [
            "soft golden sunrise tones",
            "neutral daylight realism",
            "warm cinematic highlights",
            "dramatic contrast lighting",
            "epic cinematic color grading"
        ];
        const mood = moodSequence[stage];

        const colorGrading = "cinematic color grading, filmic tones, high dynamic range";

        const lightDirection = [
            "backlit",
            "side lighting",
            "top lighting",
            "low angle lighting",
            "golden hour rim light"
        ][stage];

        const sceneVariation = [
            "wide environment shift",
            "different terrain focus",
            "sky emphasis",
            "motion environment",
            "cinematic wide ending"
        ][stage];

        const breakSimilarity = "visually distinct from previous scene, different layout, different composition";

        let basePrompt = `${subjects}, ${aspectInstruction}, ${visualDifference}, ${sceneVariation}, cinematic ${domain} scene${domainModifier}, ${camera_instruction}${environmentMotion}, color mood: ${mood}, ${colorGrading}, lighting direction: ${lightDirection}, high depth, cinematic composition, ${depthLayers}, ${realism}, ${organic}, ${variation}, ${motionContinuity}, consistent environment, same location continuity, ${breakSimilarity}, NO TEXT, NO WATERMARK`;
        
        if (this.previousSceneContext) {
            basePrompt += `, consistent with previous scene: ${this.previousSceneContext}`;
        }

        const hash = this._hashPrompt(scene?.visual_prompt || basePrompt);
        if (!this.usedPromptHashes) this.usedPromptHashes = new Set();
        if (this.usedPromptHashes.has(hash)) {
            basePrompt += ", newly generated framing, unique viewpoint";
        }
        this.usedPromptHashes.add(hash);

        console.log('[SCENE VARIATION]', sceneVariation);
        console.log('[FINAL SD PROMPT]', basePrompt);

        return basePrompt;
    }

    static _buildSdNegativePrompt(domain) {
        const common = 'text, watermark, captions, subtitles, logo, blurry, low quality, cartoon';
        if (domain === 'nature') {
            return `${common}, person, people, human, face, portrait, indoor, building`;
        }
        return common;
    }

    static async _writeBlankFallback(filePath) {
        await fs.writeFile(
            filePath,
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
    }

    static _validateImageContent(buffer) {
        if (!buffer || buffer.length < 5000) return false;

        const sample = buffer.slice(0, 500);
        const unique = new Set(sample);
        if (unique.size < 50) return false;

        let sum = 0;
        const limit = Math.min(buffer.length, 1000);
        for (let i = 0; i < limit; i++) {
            sum += buffer[i];
        }
        const avg = sum / limit;
        if (avg < 20) return false;

        let variation = 0;
        for (let i = 1; i < Math.min(buffer.length, 2000); i++) {
            variation += Math.abs(buffer[i] - buffer[i - 1]);
        }

        if (variation < 5000) return false;

        return true;
    }

    static async _generateWithSD(prompt, negative) {
        const key = process.env.STABLE_DIFFUSION_API_KEY;
        const response = await axios.post(
            'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
            {
                text_prompts: [
                    { text: prompt, weight: 1 },
                    { text: negative, weight: -1 },
                ],
                cfg_scale: 7,
                height: 1024,
                width: 1024,
                samples: 1,
                steps: 30,
            },
            {
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                timeout: 60000,
            }
        );
        const b64 = response.data?.artifacts?.[0]?.base64;
        return b64 ? Buffer.from(b64, 'base64') : null;
    }

    static getMotionMetadata(scene) {
        const m = {
            zoom_in: { startScale: 1.0, endScale: 1.1, xStart: 0, xEnd: 12, yStart: 0, yEnd: -8 },
            zoom_out: { startScale: 1.08, endScale: 1.0, xStart: 0, xEnd: -12, yStart: 0, yEnd: 8 },
            pan_left: { startScale: 1.04, endScale: 1.08, xStart: 20, xEnd: -20, yStart: 0, yEnd: -6 },
            pan_right: { startScale: 1.04, endScale: 1.08, xStart: -20, xEnd: 20, yStart: 0, yEnd: 6 },
            static: { startScale: 1.0, endScale: 1.06, xStart: 0, xEnd: 0, yStart: 0, yEnd: -4 },
        };
        
        let metadata = { ...(m[scene?.camera_motion] || m.static) };

        if (scene?.motion_type === "dynamic") {
            metadata.endScale += 0.05;
            metadata.xEnd = metadata.xEnd === 0 ? 25 : metadata.xEnd * 2;
            metadata.yEnd = metadata.yEnd === 0 ? -20 : metadata.yEnd * 2;
        }

        const getRandom = (min, max) => Math.random() * (max - min) + min;
        metadata.xEnd += getRandom(-5, 5);
        metadata.yEnd += getRandom(-5, 5);

        return metadata;
    }
}

module.exports = VisualService;
