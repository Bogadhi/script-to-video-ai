const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const DiversityService = require('./diversity.service');
const { getStyle } = require('../config/styles.config');

dotenv.config();

const SOURCE_ROTATION = ['SD', 'PEXELS', 'PIXABAY', 'SD', 'PEXELS'];
const SHOT_TYPE_SEQUENCE = [
  'wide_aerial',
  'medium_shot',
  'close_up',
  'dynamic_motion',
  'cinematic_wide',
];
const LIGHTING_CONDITIONS = [
  'sunrise',
  'sunset',
  'overcast',
  'fog',
  'golden hour',
];
const WEATHER_CONDITIONS = [
  'clear',
  'rain',
  'mist',
  'storm',
  'snow',
];
const ANGLE_CONDITIONS = [
  'aerial',
  'ground level',
  'macro',
  'tracking',
  'tilt',
];

class VisualService {
  static previousSceneContext = null;

  static _selectSourceForScene(sceneIndex, totalScenes, style = 'cinematic') {
    return SOURCE_ROTATION[sceneIndex % SOURCE_ROTATION.length];
  }

  static _getShotType(sceneIndex) {
    return SHOT_TYPE_SEQUENCE[sceneIndex % SHOT_TYPE_SEQUENCE.length];
  }

  static _getQueryVariation(sceneIndex) {
    const lighting = LIGHTING_CONDITIONS[sceneIndex % LIGHTING_CONDITIONS.length];
    const weather = WEATHER_CONDITIONS[sceneIndex % WEATHER_CONDITIONS.length];
    const angle = ANGLE_CONDITIONS[sceneIndex % ANGLE_CONDITIONS.length];
    return { lighting, weather, angle };
  }

  static async generateImage(projectId, scene, style = 'cinematic', totalScenes = 5) {
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
      scene.motion_type = 'dynamic';
    } else {
      scene.motion_type = 'cinematic';
    }

    const subjectPool = fullSubjects.length > 0 ? fullSubjects : ['visual'];
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

    const sceneIndex = (scene_id || 1) - 1;
    const sourceType = this._selectSourceForScene(sceneIndex, totalScenes, style);
    const shotType = this._getShotType(sceneIndex);
    const queryVariation = this._getQueryVariation(sceneIndex);

    console.log('[SOURCE ROTATION]', `scene=${scene_id} source=${sourceType} shot=${shotType}`);

    let result = null;

    if (sourceType === 'PEXELS') {
      const videoUrl = await this._pexelsVideoSearch(searchQuery, activeSubjects, resolvedDomain, queryVariation, shotType, style);
      if (videoUrl) {
        DiversityService.logSceneVisual(projectId, scene_id, 'PEXELS', videoUrl);
        scene.video_path = videoUrl;
        scene.image_path = null;
        return videoUrl;
      }
    } else if (sourceType === 'PIXABAY') {
      const videoUrl = await this._pixabayVideoSearch(searchQuery, activeSubjects, resolvedDomain, queryVariation, shotType, style);
      if (videoUrl) {
        DiversityService.logSceneVisual(projectId, scene_id, 'PIXABAY', videoUrl);
        scene.video_path = videoUrl;
        scene.image_path = null;
        return videoUrl;
      }
    }

    const sdImagePath = await this._generateImageFallback(projectId, filePath, searchQuery, activeSubjects, resolvedDomain, scene, style, shotType);
    if (sdImagePath) {
      this.previousSceneContext = `${activeSubjects.join(', ')}, same environment, same location, consistent lighting`;
      DiversityService.logSceneVisual(projectId, scene_id, 'SD', sdImagePath);
      scene.video_path = null;
      scene.image_path = sdImagePath;
      return sdImagePath;
    }

    const placeholderPath = await this._createUniqueColoredPlaceholder(projectId, scene_id);
    DiversityService.logSceneVisual(projectId, scene_id, 'PLACEHOLDER', placeholderPath);
    scene.video_path = null;
    scene.image_path = placeholderPath;
    return placeholderPath;
  }

    static async _pexelsVideoSearch(query, coreSubjects, domain, queryVariation = {}, shotType = 'medium_shot', style = 'cinematic') {
        const key = process.env.PEXELS_API_KEY;
        if (!key || key === 'your_pexels_key_here') return null;

        try {
            const styleConfig = getStyle(style);
            const enhancedQuery = this._enhanceQueryWithVariation(
              query,
              queryVariation,
              shotType,
              styleConfig.pexelsQueryTags || []
            );

            const response = await axios.get(
                `https://api.pexels.com/videos/search?query=${encodeURIComponent(enhancedQuery)}&orientation=landscape&per_page=10`,
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

                const projectId = process.env.CURRENT_PROJECT_ID || 'default';
                if (DiversityService.isDuplicate(projectId, match.link)) {
                    continue;
                }

                const validation = this.isValidVisual(video, enhancedQuery, coreSubjects, domain);
                if (validation.valid) {
                    DiversityService.register(projectId, match.link, 'PEXELS_VIDEO');
                    console.log('[VISUAL ACCEPTED]', match.link);
                    return match.link;
                }

                console.log('[VISUAL REJECTED]', validation.reason);
            }
        } catch (err) {
            console.warn('[Visual] pexels video error:', err.message);
        }

        return null;
    }

    static async _pixabayVideoSearch(query, coreSubjects, domain, queryVariation = {}, shotType = 'medium_shot', style = 'cinematic') {
        const key = process.env.PIXABAY_API_KEY;
        if (!key) return null;

        try {
            const styleConfig = getStyle(style);
            const enhancedQuery = this._enhanceQueryWithVariation(
              query,
              queryVariation,
              shotType,
              styleConfig.pixabayQueryTags || []
            );

            const response = await axios.get(
                `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(enhancedQuery)}&per_page=10`,
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

                const projectId = process.env.CURRENT_PROJECT_ID || 'default';
                if (DiversityService.isDuplicate(projectId, match.url)) {
                    continue;
                }

                const validation = this.isValidVisual(hit, enhancedQuery, coreSubjects, domain);
                if (validation.valid) {
                    DiversityService.register(projectId, match.url, 'PIXABAY_VIDEO');
                    console.log('[VISUAL ACCEPTED]', match.url);
                    return match.url;
                }

                console.log('[VISUAL REJECTED]', validation.reason);
            }
        } catch (err) {
            console.warn('[Visual] pixabay video error:', err.message);
        }

        return null;
    }

    static _enhanceQueryWithVariation(baseQuery, variation = {}, shotType = 'medium_shot', styleTags = []) {
        const shotModifiers = {
          wide_aerial: 'aerial drone wide',
          medium_shot: 'medium framing',
          close_up: 'close-up macro detail',
          dynamic_motion: 'motion movement',
          cinematic_wide: 'cinematic epic wide',
        };

        const shotPart = shotModifiers[shotType] || 'cinematic';
        const lightPart = variation.lighting ? ` ${variation.lighting}` : '';
        const weatherPart = variation.weather ? ` ${variation.weather}` : '';
        const styleTagsStr = styleTags.length > 0 ? ` ${styleTags[0]}` : '';

        return `${baseQuery} ${shotPart}${lightPart}${weatherPart}${styleTagsStr}`.trim();
    }

    static async _generateImageFallback(projectId, filePath, query, coreSubjects, domain, scene, style = 'cinematic', shotType = 'medium_shot') {
        const sdKey = process.env.STABLE_DIFFUSION_API_KEY;
        if (sdKey && sdKey !== 'your_sd_key_here') {
            try {
                let prompt = this._buildSdPrompt(coreSubjects, domain, scene, style, shotType);
                const styleConfig = getStyle(style);
                const negative = this._buildSdNegativePrompt(domain, styleConfig.negativePromptAdditions);

                for (let attempt = 1; attempt <= 3; attempt++) {
                    let buffer = await this._generateWithSD(prompt, negative, 7 + attempt);
                    if (buffer && this._validateImageContent(buffer)) {
                        if (DiversityService.isDuplicate(projectId, null, buffer)) {
                            if (attempt < 3) {
                                console.log(`[SD REGENERATE] attempt=${attempt} reason=hash_collision`);
                                prompt += `, completely different composition, radically different angle, uniquely distinct framing`;
                                continue;
                            }
                            return null;
                        }

                        DiversityService.registerPromptHash(projectId, prompt);
                        await fs.writeFile(filePath, buffer);
                        DiversityService.register(projectId, filePath, 'SD_IMAGE');
                        return filePath;
                    }
                    if (attempt < 3) {
                        console.log(`[SD REGENERATE] attempt=${attempt} reason=invalid_content`);
                        prompt += `, newly generated framing, unique viewpoint`;
                    }
                }
            } catch (err) {
                console.warn('[Visual] SD failed:', err.message);
            }
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

    static _buildSdPrompt(coreSubjects, domain, scene, style = 'cinematic', shotType = 'medium_shot') {
        const activeArray = scene?.activeSubjects || coreSubjects;
        const subjects = activeArray.length > 0 ? activeArray.join(', ') : 'visual concept';
        const styleConfig = getStyle(style);

        const stage = ((scene?.scene_id || 1) - 1) % 5;

        let aspectInstruction = 'vast environment, large scale composition';
        let visualDifference = 'establishing shot';

        if (stage === 0) {
            aspectInstruction = 'vast environment, large scale composition';
            visualDifference = 'establishing shot';
        } else if (stage === 1) {
            aspectInstruction = 'focused subject detail, macro textures';
            visualDifference = 'detail shot';
        } else if (stage === 2) {
            aspectInstruction = 'cinematic close framing, shallow depth';
            visualDifference = 'intimate close-up';
        } else if (stage === 3) {
            aspectInstruction = 'dynamic movement, motion realism';
            visualDifference = 'dynamic motion shot';
        } else if (stage === 4) {
            aspectInstruction = 'epic wide cinematic ending';
            visualDifference = 'final cinematic wide shot';
        }

        let cameraInstruction = '';
        if (stage === 0) {
            cameraInstruction = 'wide aerial shot, large landscape view';
        } else if (stage === 1) {
            cameraInstruction = 'medium landscape, environmental shot';
        } else if (stage === 2) {
            cameraInstruction = 'close detail, macro details, shallow depth of field';
        } else if (stage === 3) {
            cameraInstruction = 'motion shot, dynamic angle, motion blur perspective';
        } else if (stage === 4) {
            cameraInstruction = 'cinematic ending, epic wide composition';
        }

        cameraInstruction += ', different angle, different composition, different perspective, different framing';

        const variation = [
            'different angle',
            'alternate perspective',
            'cinematic framing shift',
            'lens variation',
            'composition change',
        ][stage];

        const depthLayers = 'foreground, midground, background depth composition';
        const realism = 'natural lighting gradients, realistic shadows, volumetric light';
        const organic = 'natural imperfections, organic environment variation';
        const motionContinuity = 'cinematic motion continuity, natural temporal flow';

        let domainModifier = '';
        if (domain === 'nature') {
            domainModifier = ', cinematic travel photography, national geographic style';
        } else if (domain === 'finance') {
            domainModifier = ', modern corporate cinematic visual';
        } else if (domain === 'technology') {
            domainModifier = ', futuristic digital realism';
        }

        let environmentMotion = '';
        if (stage === 3) {
            environmentMotion += 'flowing motion, moving elements, dynamic environment, temporal change';
        }
        const subjText = subjects.toLowerCase();
        if (subjText.includes('river')) {
            environmentMotion += (environmentMotion ? ', ' : '') + 'flowing water motion';
        }
        if (subjText.includes('sky') || subjText.includes('sunrise')) {
            environmentMotion += (environmentMotion ? ', ' : '') + 'moving clouds, changing light';
        }
        if (subjText.includes('forest')) {
            environmentMotion += (environmentMotion ? ', ' : '') + 'wind movement in trees';
        }
        if (environmentMotion) {
            environmentMotion = `, ${environmentMotion}`;
        }

        const moodSequence = [
            'soft golden sunrise tones',
            'neutral daylight realism',
            'warm cinematic highlights',
            'dramatic contrast lighting',
            'epic cinematic color grading',
        ];
        const mood = moodSequence[stage];

        const colorGrading = styleConfig.colorGrading || 'cinematic color grading, filmic tones, high dynamic range';

        const lightDirection = [
            'backlit',
            'side lighting',
            'top lighting',
            'low angle lighting',
            'golden hour rim light',
        ][stage];

        const sceneVariation = [
            'wide environment shift',
            'different terrain focus',
            'sky emphasis',
            'motion environment',
            'cinematic wide ending',
        ][stage];

        const breakSimilarity = 'visually distinct from previous scene, different layout, different composition';

        let basePrompt = `${subjects}, ${aspectInstruction}, ${visualDifference}, ${sceneVariation}, cinematic ${domain} scene${domainModifier}, ${cameraInstruction}${environmentMotion}, color mood: ${mood}, ${colorGrading}, lighting direction: ${lightDirection}, high depth, cinematic composition, ${depthLayers}, ${realism}, ${organic}, ${variation}, ${motionContinuity}, consistent environment, same location continuity, ${breakSimilarity}, ${styleConfig.sdModifiers}, NO TEXT, NO WATERMARK`;

        if (this.previousSceneContext) {
            basePrompt += `, consistent with previous scene: ${this.previousSceneContext}`;
        }

        console.log('[SCENE VARIATION]', sceneVariation);
        console.log('[STYLE]', style);
        console.log('[FINAL SD PROMPT]', basePrompt.slice(0, 200) + '...');

        return basePrompt;
    }

    static _buildSdNegativePrompt(domain, styleAdditions = '') {
        const common = 'text, watermark, captions, subtitles, logo, blurry, low quality, cartoon';
        const domainSpecific = domain === 'nature'
          ? ', person, people, human, face, portrait, indoor, building'
          : '';
        return `${common}${domainSpecific}${styleAdditions ? ', ' + styleAdditions : ''}`;
    }

    static async _createUniqueColoredPlaceholder(projectId, sceneId) {
        const imgDir = path.resolve(process.cwd(), 'projects', projectId, 'images');
        await fs.ensureDir(imgDir);
        const placeholderPath = path.resolve(imgDir, `scene_${String(sceneId).padStart(2, '0')}_placeholder_${Date.now()}.png`);

        const colorVariant = sceneId % 8;
        const colorBytes = [
          [0x1f, 0x77, 0xb4], // blue
          [0xff, 0x7f, 0x0e], // orange
          [0x2c, 0xa0, 0x2c], // green
          [0xd6, 0x27, 0x28], // red
          [0x94, 0x67, 0xbd], // purple
          [0x8c, 0x56, 0x4b], // brown
          [0xe3, 0x77, 0xc2], // pink
          [0x7f, 0x7f, 0x7f], // gray
        ][colorVariant];

        await fs.writeFile(
          placeholderPath,
          Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x91, 0x68,
            0x36, 0x00, 0x00, 0x00, 0x19, 0x74, 0x45, 0x58, 0x74, 0x53, 0x6f, 0x66, 0x74, 0x77, 0x61, 0x72,
            0x65, 0x00, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x49, 0x6d, 0x61, 0x67, 0x65, 0x52, 0x65, 0x61,
            0x64, 0x79, 0x71, 0xc9, 0x65, 0x3c, 0x00, 0x00, 0x00, 0x3a, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda,
            0xec, 0xc1, 0x01, 0x0d, 0x00, 0x00, 0x00, 0xc2, 0xa0, 0xf7, 0x4f, 0xed, 0x61, 0x0d, 0xa0, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ...colorBytes,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
          ])
        );

        return placeholderPath;
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

    static async _generateWithSD(prompt, negative, cfgScale = 7) {
        const key = process.env.STABLE_DIFFUSION_API_KEY;
        const response = await axios.post(
            'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
            {
                text_prompts: [
                    { text: prompt, weight: 1 },
                    { text: negative, weight: -1 },
                ],
                cfg_scale: cfgScale,
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
