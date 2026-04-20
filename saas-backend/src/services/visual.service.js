const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const DiversityService = require('./diversity.service');
const MetricsService = require('./metrics.service');
const { getStyle } = require('../config/styles.config');

dotenv.config();

const SOURCE_ROTATION = ['PEXELS', 'PIXABAY', 'SD', 'PEXELS'];
const FALLBACK_RELEVANCE_THRESHOLD = 0.7;
const SEMANTIC_SIMILARITY_THRESHOLD = 0.85;
const SHOT_DEFAULTS = {
  wide_aerial: { camera: 'aerial wide view', shotType: 'wide', composition: 'wide' },
  medium_shot: { camera: 'medium cinematic view', shotType: 'medium', composition: 'medium' },
  close_up: { camera: 'macro close-up detail', shotType: 'close-up', composition: 'close-up' },
  dynamic_motion: { camera: 'tracking motion angle', shotType: 'dynamic', composition: 'medium' },
  cinematic_wide: { camera: 'epic closing frame', shotType: 'wide', composition: 'wide' },
};

class VisualService {
  static previousSceneContext = null;
  static semanticMemory = new Map();

  static async generateImage(projectId, scene, style = 'cinematic', totalScenes = 5) {
    const { scene_id, visual_prompt, keywords, domain } = scene;
    const projectDir = path.join(process.cwd(), 'projects', projectId, 'images');
    await fs.ensureDir(projectDir);

    const uniqueTS = Date.now().toString().slice(-6);
    const fileName = `scene_${String(scene_id).padStart(2, '0')}_v${uniqueTS}.png`;
    const filePath = path.join(projectDir, fileName);

    const activeSubjects = this._resolveActiveSubjects(scene, keywords);
    scene.activeSubjects = activeSubjects;
    const resolvedDomain = this._resolveDomain(domain, visual_prompt, activeSubjects);
    const shotType = this._resolveShotType(scene);
    const searchQueries = this._resolveSearchQueries(scene, activeSubjects, resolvedDomain, style, shotType);
    const sourceStartIndex = (Number(scene_id || 1) - 1) % SOURCE_ROTATION.length;
    const sourcePlan = this._buildSourcePlan(sourceStartIndex);

    console.log('[ACTIVE SUBJECTS]', activeSubjects);
    console.log('[QUERY COUNT]', searchQueries.length);
    console.log('[SOURCE ROTATION]', `scene=${scene_id} plan=${sourcePlan.join('->')}`);

    for (const sourceType of sourcePlan) {
      if (sourceType === 'SD' && !process.env.STABLE_DIFFUSION_API_KEY) {
        continue;
      }

      for (let queryIndex = 0; queryIndex < searchQueries.length; queryIndex += 1) {
        const query = searchQueries[queryIndex];
        const selected = await this._selectAssetForSource({
          sourceType,
          query,
          queryIndex,
          activeSubjects,
          resolvedDomain,
          scene,
          style,
          shotType,
          projectId,
          filePath,
        });

        if (!selected) {
          continue;
        }

        const quality = this._scoreCandidateRelevance(selected.relevanceText, query, activeSubjects, resolvedDomain);
        if (quality.score < FALLBACK_RELEVANCE_THRESHOLD && !selected.alreadySimplified) {
          console.warn(`[Visual] scene=${scene_id} source=${sourceType} score=${quality.score.toFixed(2)} retrying simplified query`);
          const simplifiedQuery = this._simplifyQuery(query, activeSubjects, shotType);
          const retried = await this._selectAssetForSource({
            sourceType,
            query: simplifiedQuery,
            queryIndex: queryIndex + 100,
            activeSubjects,
            resolvedDomain,
            scene,
            style,
            shotType,
            projectId,
            filePath,
            alreadySimplified: true,
          });
          if (!retried) {
            continue;
          }
          if (!this._finalizeSelection(projectId, scene, retried, activeSubjects, resolvedDomain)) {
            continue;
          }
          return retried.path;
        }

        if (!this._finalizeSelection(projectId, scene, selected, activeSubjects, resolvedDomain, quality.score)) {
          continue;
        }
        return selected.path;
      }
    }

    const placeholderPath = await this._createUniqueColoredPlaceholder(projectId, scene_id);
    DiversityService.logSceneVisual(projectId, scene_id, 'PLACEHOLDER', placeholderPath);
    scene.video_path = null;
    scene.image_path = placeholderPath;
    scene.metadata = {
      ...(scene.metadata || {}),
      relevance_score: 0,
      semantic_similarity: 0,
      selected_source: 'PLACEHOLDER',
    };
    return placeholderPath;
  }

  static _finalizeSelection(projectId, scene, selected, activeSubjects, resolvedDomain, precomputedScore = null) {
    const quality = precomputedScore !== null
      ? { score: precomputedScore, matchCount: 0 }
      : this._scoreCandidateRelevance(selected.relevanceText, selected.query, activeSubjects, resolvedDomain);
    const semantic = this._passesSemanticDiversity(projectId, scene.scene_id, selected.semanticText);
    if (!semantic.valid) {
      console.log('[VISUAL REJECTED]', semantic.reason);
      return false;
    }

    this._rememberSemantic(projectId, scene.scene_id, selected.semanticText);
    this.previousSceneContext = `${activeSubjects.join(', ')}, same environment, same location, consistent lighting`;
    scene.metadata = {
      ...(scene.metadata || {}),
      relevance_score: Number(quality.score.toFixed(3)),
      semantic_similarity: Number(semantic.similarity.toFixed(3)),
      selected_source: selected.sourceType,
      selected_query: selected.query,
    };

    if (selected.sourceType === 'SD') {
      scene.video_path = null;
      scene.image_path = selected.path;
    } else {
      scene.video_path = selected.path;
      scene.image_path = null;
    }

    DiversityService.logSceneVisual(projectId, scene.scene_id, selected.sourceType, selected.path, {
      relevanceScore: quality.score,
      semanticSimilarity: semantic.similarity,
    });
    return true;
  }

  static async _selectAssetForSource(params) {
    const {
      sourceType,
      query,
      activeSubjects,
      resolvedDomain,
      scene,
      style,
      shotType,
      projectId,
      filePath,
      alreadySimplified = false,
    } = params;

    if (sourceType === 'PEXELS') {
      return this._pexelsVideoSearch(query, activeSubjects, resolvedDomain, shotType, style, scene, alreadySimplified);
    }
    if (sourceType === 'PIXABAY') {
      return this._pixabayVideoSearch(query, activeSubjects, resolvedDomain, shotType, style, scene, alreadySimplified);
    }
    if (sourceType === 'SD') {
      return this._generateImageFallback(projectId, filePath, query, activeSubjects, resolvedDomain, scene, style, shotType, alreadySimplified);
    }
    return null;
  }

  static _resolveActiveSubjects(scene, keywords) {
    const fullSubjects = (keywords && keywords.length > 0)
      ? keywords.filter((keyword) => !['cinematic', 'beautiful', 'amazing', 'epic', 'dramatic', 'visual'].includes(String(keyword).toLowerCase()))
      : [];
    const variation = String(scene.subject_variation || '').trim();
    const variationTokens = variation.split(',').map((token) => token.trim()).filter(Boolean);
    return [...new Set([...fullSubjects, ...variationTokens])].slice(0, 4).filter(Boolean);
  }

  static _resolveSearchQueries(scene, activeSubjects, resolvedDomain, style, shotType) {
    const existing = Array.isArray(scene.search_queries) ? scene.search_queries.filter(Boolean) : [];
    if (existing.length >= 5) {
      return existing.slice(0, 5);
    }

    const shot = SHOT_DEFAULTS[shotType] || SHOT_DEFAULTS.medium_shot;
    const styleConfig = getStyle(style);
    const base = activeSubjects.join(' ') || 'visual concept';
    return [
      `${base} ${shot.camera} ${resolvedDomain} ${styleConfig.label}`,
      `${base} side angle ${resolvedDomain} ${styleConfig.lightingProfile}`,
      `${base} detail layer ${resolvedDomain} ${styleConfig.lensPrompt}`,
      `${base} motion pass ${resolvedDomain} ${styleConfig.textureProfile}`,
      `${base} alternate composition ${resolvedDomain} ${shot.composition}`,
    ].map((query) => query.replace(/\s+/g, ' ').trim());
  }

  static _buildSourcePlan(startIndex) {
    const plan = [];
    for (let step = 0; step < SOURCE_ROTATION.length; step += 1) {
      plan.push(SOURCE_ROTATION[(startIndex + step) % SOURCE_ROTATION.length]);
    }
    return plan;
  }

  static async _pexelsVideoSearch(query, coreSubjects, domain, shotType = 'medium_shot', style = 'cinematic', scene = {}, alreadySimplified = false) {
    const key = process.env.PEXELS_API_KEY;
    if (!key || key === 'your_pexels_key_here') return null;

    try {
      const styleConfig = getStyle(style);
      const enhancedQuery = this._enhanceQuery(query, shotType, styleConfig);
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
          file?.link && file?.file_type === 'video/mp4' && Number(file?.width) >= 1280
        );
        if (!match?.link) {
          continue;
        }
        const projectId = process.env.CURRENT_PROJECT_ID || 'default';
        if (DiversityService.isDuplicate(projectId, match.link)) {
          continue;
        }

        const text = JSON.stringify({
          url: match.link,
          alt: video?.user?.name,
          tags: video?.tags,
          query: enhancedQuery,
          shotType,
        });
        const validation = this.isValidVisual(text, enhancedQuery, coreSubjects, domain);
        if (!validation.valid) {
          continue;
        }
        DiversityService.register(projectId, match.link, 'PEXELS_VIDEO');
        return {
          sourceType: 'PEXELS',
          path: match.link,
          query: enhancedQuery,
          relevanceText: text,
          semanticText: text,
          alreadySimplified,
        };
      }
    } catch (error) {
      console.warn('[Visual] pexels video error:', error.message);
    }
    return null;
  }

  static async _pixabayVideoSearch(query, coreSubjects, domain, shotType = 'medium_shot', style = 'cinematic', scene = {}, alreadySimplified = false) {
    const key = process.env.PIXABAY_API_KEY;
    if (!key) return null;

    try {
      const styleConfig = getStyle(style);
      const enhancedQuery = this._enhanceQuery(query, shotType, styleConfig);
      const response = await axios.get(
        `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(enhancedQuery)}&per_page=10`,
        { timeout: 10000 }
      );

      const hits = response.data?.hits || [];
      for (const hit of hits) {
        const candidates = [hit?.videos?.large, hit?.videos?.medium, hit?.videos?.small, hit?.videos?.tiny];
        const match = candidates.find((video) => video?.url && Number(video?.width) >= 1280);
        if (!match?.url) {
          continue;
        }
        const projectId = process.env.CURRENT_PROJECT_ID || 'default';
        if (DiversityService.isDuplicate(projectId, match.url)) {
          continue;
        }

        const text = JSON.stringify({
          url: match.url,
          tags: hit?.tags,
          user: hit?.user,
          query: enhancedQuery,
          shotType,
        });
        const validation = this.isValidVisual(text, enhancedQuery, coreSubjects, domain);
        if (!validation.valid) {
          continue;
        }
        DiversityService.register(projectId, match.url, 'PIXABAY_VIDEO');
        return {
          sourceType: 'PIXABAY',
          path: match.url,
          query: enhancedQuery,
          relevanceText: text,
          semanticText: text,
          alreadySimplified,
        };
      }
    } catch (error) {
      console.warn('[Visual] pixabay video error:', error.message);
    }
    return null;
  }

  static _enhanceQuery(query, shotType, styleConfig) {
    const shot = SHOT_DEFAULTS[shotType] || SHOT_DEFAULTS.medium_shot;
    const styleTag = styleConfig.pexelsQueryTags?.[0] || styleConfig.pixabayQueryTags?.[0] || styleConfig.label;
    return `${query} ${shot.camera} ${styleTag}`.trim();
  }

  static async _generateImageFallback(projectId, filePath, query, coreSubjects, domain, scene, style = 'cinematic', shotType = 'medium_shot', alreadySimplified = false) {
    const sdKey = process.env.STABLE_DIFFUSION_API_KEY;
    if (!sdKey || sdKey === 'your_sd_key_here') {
      return null;
    }

    try {
      const styleConfig = getStyle(style);
      let prompt = this._buildSdPrompt(coreSubjects, domain, scene, style, shotType, query);
      const negative = this._buildSdNegativePrompt(domain, styleConfig.negativePromptAdditions);

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const buffer = await this._generateWithSD(prompt, negative, 7 + attempt);
        if (buffer && this._validateImageContent(buffer)) {
          if (DiversityService.isDuplicate(projectId, null, buffer)) {
            prompt += ', entirely different framing and subject arrangement';
            continue;
          }

          await fs.writeFile(filePath, buffer);
          DiversityService.register(projectId, filePath, 'SD_IMAGE');
          MetricsService.logApiCost(projectId, 'stability', {
            ...MetricsService.estimateStabilityCost(1),
            meta: { shotType },
          });
          return {
            sourceType: 'SD',
            path: filePath,
            query,
            relevanceText: prompt,
            semanticText: `${prompt}:${this._bufferFingerprint(buffer)}`,
            alreadySimplified,
          };
        }
        prompt += ', simpler composition, clearer primary subject';
      }
    } catch (error) {
      console.warn('[Visual] SD failed:', error.message);
    }
    return null;
  }

  static _scoreCandidateRelevance(relevanceText, query, subjects, domain) {
    const text = String(relevanceText || '').toLowerCase();
    const normalizedSubjects = (subjects || []).map((subject) => String(subject).toLowerCase()).filter(Boolean);
    const subjectMatches = normalizedSubjects.filter((subject) => text.includes(subject)).length;
    const subjectScore = normalizedSubjects.length ? subjectMatches / normalizedSubjects.length : 0.6;
    const queryTokens = String(query || '').toLowerCase().split(/\s+/).filter((token) => token.length > 3);
    const queryMatches = queryTokens.filter((token) => text.includes(token)).length;
    const queryScore = queryTokens.length ? Math.min(1, queryMatches / queryTokens.length) : 0.6;
    const domainScore = domain === 'generic' ? 0.85 : (text.includes(domain) ? 1 : 0.45);
    const score = (subjectScore * 0.5) + (queryScore * 0.3) + (domainScore * 0.2);
    return {
      score,
      matchCount: subjectMatches,
    };
  }

  static _passesSemanticDiversity(projectId, sceneId, semanticText) {
    const currentVector = this._semanticVector(semanticText);
    const memory = this.semanticMemory.get(projectId) || [];
    const previous = memory[memory.length - 1];
    if (!previous) {
      return { valid: true, similarity: 0 };
    }

    const similarity = this._cosineSimilarity(previous.vector, currentVector);
    if (similarity > SEMANTIC_SIMILARITY_THRESHOLD) {
      return {
        valid: false,
        similarity,
        reason: `semantic similarity ${similarity.toFixed(2)} exceeds threshold`,
      };
    }

    return { valid: true, similarity };
  }

  static _rememberSemantic(projectId, sceneId, semanticText) {
    const memory = this.semanticMemory.get(projectId) || [];
    memory.push({
      sceneId,
      vector: this._semanticVector(semanticText),
    });
    this.semanticMemory.set(projectId, memory.slice(-12));
  }

  static _semanticVector(text) {
    const normalized = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const vector = new Array(16).fill(0);
    tokens.forEach((token) => {
      const digest = crypto.createHash('md5').update(token).digest();
      for (let index = 0; index < vector.length; index += 1) {
        vector[index] += digest[index] / 255;
      }
    });
    return vector;
  }

  static _cosineSimilarity(a, b) {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let index = 0; index < a.length; index += 1) {
      dot += a[index] * b[index];
      magA += a[index] * a[index];
      magB += b[index] * b[index];
    }
    if (!magA || !magB) {
      return 0;
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  static _simplifyQuery(query, activeSubjects, shotType) {
    const shot = SHOT_DEFAULTS[shotType] || SHOT_DEFAULTS.medium_shot;
    return `${(activeSubjects || []).slice(0, 2).join(' ')} ${shot.camera}`.trim();
  }

  static _resolveShotType(scene) {
    if (scene.shot_type && SHOT_DEFAULTS[scene.shot_type]) {
      return scene.shot_type;
    }
    const composition = String(scene.composition || '').toLowerCase();
    if (composition.includes('wide')) return 'wide_aerial';
    if (composition.includes('close')) return 'close_up';
    return 'medium_shot';
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

  static isValidVisual(relevanceText, query, subjects, domain) {
    const text = String(relevanceText || '').toLowerCase();
    const normalizedSubjects = (subjects || []).map((subject) => String(subject).toLowerCase()).filter(Boolean);
    const minMatch = Math.max(1, Math.ceil(normalizedSubjects.length * 0.4));
    const matchCount = normalizedSubjects.filter((subject) => text.includes(subject)).length;
    if (normalizedSubjects.length > 0 && matchCount < minMatch) {
      return { valid: false, reason: 'insufficient subject match' };
    }

    if (domain !== 'generic' && !text.includes(domain) && query && !String(query).toLowerCase().includes(domain)) {
      return { valid: false, reason: 'domain mismatch' };
    }

    const banned = domain === 'nature'
      ? ['person', 'people', 'face', 'portrait', 'indoor', 'building', 'city']
      : ['watermark', 'blurry', 'cartoon'];
    if (banned.some((token) => text.includes(token))) {
      return { valid: false, reason: 'banned content' };
    }
    return { valid: true, reason: '' };
  }

  static _buildSdPrompt(coreSubjects, domain, scene, style = 'cinematic', shotType = 'medium_shot', query = '') {
    const styleConfig = getStyle(style);
    const shot = SHOT_DEFAULTS[shotType] || SHOT_DEFAULTS.medium_shot;
    const subjects = (scene?.activeSubjects || coreSubjects || []).join(', ') || 'visual subject';
    const continuity = this.previousSceneContext ? `consistent world continuity with ${this.previousSceneContext}` : 'fresh composition';
    return [
      subjects,
      scene.subject_variation || '',
      `domain: ${domain}`,
      `composition: ${shot.composition}`,
      `camera: ${shot.camera}`,
      `lens: ${styleConfig.lensPrompt}`,
      `lighting: ${styleConfig.lightingProfile}`,
      styleConfig.textureProfile,
      query,
      continuity,
      'photorealistic, high detail, no text, no watermark',
    ].join(', ');
  }

  static _buildSdNegativePrompt(domain, styleAdditions = '') {
    const common = 'text, watermark, captions, subtitles, logo, blurry, low quality, cartoon';
    const domainSpecific = domain === 'nature'
      ? ', person, people, human, face, portrait, indoor, building'
      : '';
    return `${common}${domainSpecific}${styleAdditions ? `, ${styleAdditions}` : ''}`;
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

  static _bufferFingerprint(buffer) {
    return crypto.createHash('sha1').update(buffer.slice(0, Math.min(buffer.length, 4096))).digest('hex');
  }

  static async _createUniqueColoredPlaceholder(projectId, sceneId) {
    const imgDir = path.resolve(process.cwd(), 'projects', projectId, 'images');
    await fs.ensureDir(imgDir);
    const placeholderPath = path.resolve(imgDir, `scene_${String(sceneId).padStart(2, '0')}_placeholder_${Date.now()}.png`);
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

  static _validateImageContent(buffer) {
    if (!buffer || buffer.length < 5000) return false;
    const sample = buffer.slice(0, 500);
    if (new Set(sample).size < 50) return false;
    return true;
  }

  static getMotionMetadata(scene) {
    const composition = String(scene?.composition || '').toLowerCase();
    const shotType = scene?.shot_type || (composition.includes('wide') ? 'wide_aerial' : composition.includes('close') ? 'close_up' : 'medium_shot');
    const storyRole = String(scene?.story_role || '').toLowerCase();
    const presets = {
      wide_aerial: { startScale: 1.02, endScale: 1.06, xStart: 30, xEnd: -30, yStart: 0, yEnd: -8 },
      medium_shot: { startScale: 1.02, endScale: 1.08, xStart: 0, xEnd: 10, yStart: 0, yEnd: -5 },
      close_up: { startScale: 1.0, endScale: 1.12, xStart: 0, xEnd: 0, yStart: 0, yEnd: -6 },
      dynamic_motion: { startScale: 1.03, endScale: 1.15, xStart: -18, xEnd: 22, yStart: 0, yEnd: -12 },
      cinematic_wide: { startScale: 1.01, endScale: 1.07, xStart: -24, xEnd: 24, yStart: 0, yEnd: -4 },
    };
    const base = { ...(presets[shotType] || presets.medium_shot) };
    if (storyRole === 'hook') {
      base.endScale += 0.03;
      base.xEnd *= 1.2;
    }
    return base;
  }
}

module.exports = VisualService;
