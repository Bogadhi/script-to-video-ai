const axios = require('axios');
const dotenv = require('dotenv');
const { getStyle } = require('../config/styles.config');
const MetricsService = require('./metrics.service');

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const STORY_ROLES = ['hook', 'development', 'detail', 'resolution'];
const COMPOSITION_SEQUENCE = ['wide', 'medium', 'close-up'];
const SHOT_SEQUENCE = ['wide_aerial', 'medium_shot', 'close_up', 'dynamic_motion', 'cinematic_wide'];
const LENS_BY_COMPOSITION = {
  wide: '24mm wide lens',
  medium: '50mm cinematic lens',
  'close-up': '85mm portrait lens',
};
const LIGHTING_VARIATIONS = [
  'golden sunrise haze',
  'side-lit dramatic contrast',
  'soft overcast realism',
  'neon practical glow',
  'misty atmosphere',
];
const ANGLE_VARIATIONS = [
  'drone establishing angle',
  'eye-level narrative angle',
  'macro detail angle',
  'tracking motion angle',
  'parallax reveal angle',
];

class SceneService {
  static _getVisualFocus(index) {
    return SHOT_SEQUENCE[index % SHOT_SEQUENCE.length];
  }

  static async generateScenes(script, category = 'storytelling', style = 'cinematic') {
    console.log('[SceneService] Generating story-aware scenes...');
    const domain = this._detectDomain(script);
    const coreSubjects = this._extractCoreSubjects(script);
    const baseLighting = this._detectLighting(script, domain, style);
    const styleProfile = getStyle(style);

    try {
      const scenes = await this._generateWithOpenRouter(script, category, coreSubjects, domain, baseLighting, styleProfile, style);
      if (scenes?.length) {
        return this._finalizeScenes(scenes, coreSubjects, domain, baseLighting, styleProfile, style);
      }
    } catch (error) {
      console.warn('[SceneService] OpenRouter failed:', error.message);
    }

    const fallbackScenes = this._keywordAwareSplitter(script, category, coreSubjects, domain, baseLighting, styleProfile);
    return this._finalizeScenes(fallbackScenes, coreSubjects, domain, baseLighting, styleProfile, style);
  }

  static async _generateWithOpenRouter(script, category, coreSubjects, domain, lighting, styleProfile, styleName) {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set');
    }

    const subjectText = coreSubjects.join(', ');
    const systemPrompt = `You are a cinematic planner for an AI video SaaS.

Return only JSON array.
Every scene must preserve semantic diversity while staying on-topic.
Use these mandatory cinematic beats in order: Hook, Development, Detail, Resolution.
First 3 scenes MUST be composition forced: wide, medium, close-up.
Each scene must include:
- scene_id
- narration
- visual_prompt
- keywords
- mood
- camera_motion
- composition
- story_role
- shot_type
- duration
- search_queries (exactly 5 distinct queries with different angle/lighting wording)
- subject_variation
- relevance_goal

Style profile:
- label: ${styleProfile.label}
- lens: ${styleProfile.lensPrompt}
- lighting: ${styleProfile.lightingProfile}
- texture: ${styleProfile.textureProfile}

Domain: ${domain}
Category: ${category}
Subjects: ${subjectText}
Base lighting: ${lighting}`;

    const userPrompt = `Script:
"""
${script.trim().slice(0, 5000)}
"""

Produce 4-8 scenes with YouTube-competitive cinematic rhythm.
Hook should feel fastest.
Detail should be most intimate.
Resolution should feel conclusive.
Search queries must remain safe for stock video search and semantically varied.`;

    const response = await axios.post(
      OPENROUTER_URL,
      {
        model: 'mistralai/mistral-small-3.1-24b-instruct:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.45,
        max_tokens: 3000,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://videosaas.local',
          'X-Title': 'VideoSaaS Pipeline',
        },
        timeout: 45000,
      }
    );

    MetricsService.logApiCost(process.env.CURRENT_PROJECT_ID || 'scene-planner', 'openrouter', {
      ...MetricsService.estimateOpenRouterCost(response.data?.usage || {}),
      requests: 1,
      meta: {
        model: response.data?.model || 'mistral-small',
      },
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty AI response');
    }

    const jsonText = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const match = jsonText.match(/\[[\s\S]*\]/);
      if (!match) {
        throw new Error('Cannot parse AI JSON');
      }
      parsed = JSON.parse(match[0]);
    }

    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.scenes)) {
      parsed = parsed.scenes;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Empty scene array');
    }

    return parsed;
  }

  static _keywordAwareSplitter(script, category, coreSubjects, domain, lighting, styleProfile) {
    const sentences = script
      .replace(/([.!?])\s+/g, '$1|')
      .split('|')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 8);

    const targetScenes = Math.min(8, Math.max(4, Math.ceil((sentences.length || 4) / 2)));
    const batchSize = Math.max(1, Math.ceil((sentences.length || 1) / targetScenes));
    const chunks = [];
    for (let index = 0; index < sentences.length; index += batchSize) {
      chunks.push(sentences.slice(index, index + batchSize).join(' '));
    }
    while (chunks.length < 4) {
      chunks.push(chunks[chunks.length - 1] || script.slice(0, 120));
    }

    return chunks.map((text, index) => {
      const storyRole = this._storyRoleForIndex(index, chunks.length);
      const composition = this._compositionForIndex(index);
      const shotType = this._shotTypeForComposition(composition, storyRole);
      const subjectVariation = this._subjectVariation(coreSubjects, index, domain);
      const searchQueries = this._buildSearchQueries({
        subjects: coreSubjects,
        subjectVariation,
        composition,
        shotType,
        lighting,
        domain,
        styleProfile,
        index,
      });
      return {
        scene_id: index + 1,
        narration: text,
        visual_prompt: this._buildVisualPrompt({
          domain,
          subjects: coreSubjects,
          composition,
          storyRole,
          subjectVariation,
          lighting,
          styleProfile,
          shotType,
        }),
        keywords: coreSubjects,
        mood: this._moodForRole(storyRole),
        camera_motion: this._cameraMotionForComposition(composition, storyRole),
        composition,
        story_role: storyRole,
        shot_type: shotType,
        duration: this._durationForRoleAndComposition(storyRole, composition, text),
        subject_variation: subjectVariation,
        search_queries: searchQueries,
        relevance_goal: 0.7,
      };
    });
  }

  static _finalizeScenes(inputScenes, coreSubjects, domain, lighting, styleProfile, styleName) {
    let scenes = (Array.isArray(inputScenes) ? inputScenes : [])
      .filter(Boolean)
      .slice(0, 24)
      .map((scene, index) => {
        const storyRole = this._storyRoleForIndex(index, inputScenes.length);
        const composition = this._normalizeComposition(scene.composition, index);
        const shotType = scene.shot_type || this._shotTypeForComposition(composition, storyRole);
        const subjectVariation = scene.subject_variation || this._subjectVariation(coreSubjects, index, domain);
        const searchQueries = Array.isArray(scene.search_queries) && scene.search_queries.length >= 5
          ? scene.search_queries.slice(0, 5)
          : this._buildSearchQueries({
              subjects: coreSubjects,
              subjectVariation,
              composition,
              shotType,
              lighting,
              domain,
              styleProfile,
              index,
            });
        const visualPrompt = this._buildVisualPrompt({
          domain,
          subjects: scene.keywords || coreSubjects,
          composition,
          storyRole,
          subjectVariation,
          lighting,
          styleProfile,
          shotType,
          visualPrompt: scene.visual_prompt,
        });
        return {
          scene: index + 1,
          scene_id: index + 1,
          text: scene.narration || scene.text || '',
          narration: scene.narration || scene.text || '',
          visual_focus: this._getVisualFocus(index),
          visual_prompt: visualPrompt,
          keywords: (scene.keywords || coreSubjects).slice(0, 5),
          domain,
          negative_prompt: this._buildNegativePrompt(domain, styleName),
          camera_motion: this._normalizeMotion(scene.camera_motion || this._cameraMotionForComposition(composition, storyRole)),
          mood: this._normalizeMood(scene.mood || this._moodForRole(storyRole)),
          lighting,
          style: styleProfile.label,
          style_profile: styleProfile,
          composition,
          shot_type: shotType,
          story_role: storyRole,
          structure_role: storyRole,
          subject_variation: subjectVariation,
          search_queries: searchQueries,
          continuity_hint: `Same domain, same story world, new subject detail: ${subjectVariation}`,
          relevance_goal: Number(scene.relevance_goal || 0.7),
          duration: this._durationForRoleAndComposition(storyRole, composition, scene.narration || scene.text || ''),
        };
      });

    if (scenes.length < 4 && scenes.length > 0) {
      while (scenes.length < 4) {
        const source = scenes[scenes.length - 1];
        scenes.push({
          ...source,
          scene: scenes.length + 1,
          scene_id: scenes.length + 1,
          composition: this._compositionForIndex(scenes.length),
          story_role: this._storyRoleForIndex(scenes.length, 4),
          search_queries: this._buildSearchQueries({
            subjects: coreSubjects,
            subjectVariation: this._subjectVariation(coreSubjects, scenes.length, domain),
            composition: this._compositionForIndex(scenes.length),
            shotType: this._shotTypeForComposition(this._compositionForIndex(scenes.length), this._storyRoleForIndex(scenes.length, 4)),
            lighting,
            domain,
            styleProfile,
            index: scenes.length,
          }),
        });
      }
    }

    return scenes;
  }

  static _buildSearchQueries({ subjects, subjectVariation, composition, shotType, lighting, domain, styleProfile, index }) {
    const baseSubjects = (subjects || []).slice(0, 3).join(' ').trim() || 'visual subject';
    const domainHint = this._domainVisualDescriptor(domain);
    const styleHint = styleProfile?.label || 'Cinematic';
    const queryPairs = [
      ['establishing', LIGHTING_VARIATIONS[index % LIGHTING_VARIATIONS.length]],
      ['alternative angle', LIGHTING_VARIATIONS[(index + 1) % LIGHTING_VARIATIONS.length]],
      ['detail focus', LIGHTING_VARIATIONS[(index + 2) % LIGHTING_VARIATIONS.length]],
      ['motion pass', LIGHTING_VARIATIONS[(index + 3) % LIGHTING_VARIATIONS.length]],
      ['resolution frame', LIGHTING_VARIATIONS[(index + 4) % LIGHTING_VARIATIONS.length]],
    ];

    return queryPairs.map(([intent, light], queryIndex) => {
      const angle = ANGLE_VARIATIONS[(index + queryIndex) % ANGLE_VARIATIONS.length];
      return [
        baseSubjects,
        subjectVariation,
        composition,
        shotType.replace(/_/g, ' '),
        intent,
        angle,
        light,
        lighting,
        styleHint,
        domainHint,
      ].join(' ').replace(/\s+/g, ' ').trim();
    });
  }

  static _buildVisualPrompt({ domain, subjects, composition, storyRole, subjectVariation, lighting, styleProfile, shotType, visualPrompt = '' }) {
    const subjectText = (subjects || []).join(', ');
    const lens = styleProfile?.lensPrompt || '35mm cinematic lens';
    const styleLighting = styleProfile?.lightingProfile || lighting;
    const texture = styleProfile?.textureProfile || 'premium detail';
    const base = visualPrompt && visualPrompt.length > 20
      ? visualPrompt
      : `Cinematic ${composition} of ${subjectText}, ${subjectVariation}, ${this._domainVisualDescriptor(domain)}`;

    return [
      base,
      `story beat: ${storyRole}`,
      `shot type: ${shotType.replace(/_/g, ' ')}`,
      `lens: ${lens}`,
      `lighting: ${lighting}, ${styleLighting}`,
      `texture: ${texture}`,
      'distinct composition from adjacent scenes',
      'high relevance to narration',
    ].join(', ');
  }

  static _buildNegativePrompt(domain, styleName) {
    const common = ['text', 'watermark', 'blurry', 'low quality'];
    if (styleName !== 'anime') {
      common.push('cartoon', 'anime');
    }
    if (domain === 'nature') {
      common.push('people', 'portrait', 'indoor', 'building');
    }
    return common.join(', ');
  }

  static _storyRoleForIndex(index, totalScenes) {
    if (index === 0) return 'hook';
    if (index === totalScenes - 1) return 'resolution';
    if (index === 2 || index === Math.floor(totalScenes / 2)) return 'detail';
    return 'development';
  }

  static _compositionForIndex(index) {
    if (index < COMPOSITION_SEQUENCE.length) {
      return COMPOSITION_SEQUENCE[index];
    }
    return index % 2 === 0 ? 'medium' : 'wide';
  }

  static _normalizeComposition(composition, index) {
    const normalized = String(composition || '').toLowerCase();
    if (index < COMPOSITION_SEQUENCE.length) {
      return COMPOSITION_SEQUENCE[index];
    }
    if (normalized.includes('close')) return 'close-up';
    if (normalized.includes('wide')) return 'wide';
    return 'medium';
  }

  static _shotTypeForComposition(composition, storyRole) {
    if (storyRole === 'hook') return 'dynamic_motion';
    if (composition === 'wide') return 'wide_aerial';
    if (composition === 'close-up') return 'close_up';
    return 'medium_shot';
  }

  static _durationForRoleAndComposition(storyRole, composition, text = '') {
    const words = String(text || '').split(/\s+/).filter(Boolean).length;
    const narrationDuration = Math.max(2, Math.min(6, words * 0.38));
    if (composition === 'close-up' || storyRole === 'detail') {
      return Math.max(2, Math.min(3, narrationDuration));
    }
    if (composition === 'wide') {
      return Math.max(4, Math.min(6, narrationDuration + 1));
    }
    return Math.max(3, Math.min(4.5, narrationDuration));
  }

  static _subjectVariation(coreSubjects, index, domain) {
    const primary = coreSubjects[index % coreSubjects.length] || coreSubjects[0] || 'subject';
    const secondary = coreSubjects[(index + 1) % coreSubjects.length] || primary;
    const suffixes = {
      nature: ['ridge line', 'river bend', 'stone texture', 'mist layer', 'canopy detail'],
      technology: ['dashboard glow', 'microchip detail', 'data pulse', 'screen reflection', 'network depth'],
      finance: ['chart momentum', 'ticker screen', 'market floor', 'growth trajectory', 'portfolio detail'],
      generic: ['hero subject', 'supporting texture', 'foreground layer', 'motion accent', 'environment cue'],
    };
    const bank = suffixes[domain] || suffixes.generic;
    return `${primary} with ${secondary} emphasis, ${bank[index % bank.length]}`;
  }

  static _cameraMotionForComposition(composition, storyRole) {
    if (storyRole === 'hook') return 'pan_right';
    if (composition === 'wide') return 'pan_left';
    if (composition === 'close-up') return 'zoom_in';
    return 'static';
  }

  static _moodForRole(storyRole) {
    if (storyRole === 'hook') return 'energetic';
    if (storyRole === 'detail') return 'mysterious';
    if (storyRole === 'resolution') return 'epic';
    return 'calm';
  }

  static _normalizeMood(mood) {
    const valid = ['epic', 'mysterious', 'energetic', 'calm', 'somber'];
    const normalized = String(mood || 'calm').toLowerCase();
    return valid.includes(normalized) ? normalized : 'calm';
  }

  static _detectDomain(script) {
    const text = String(script || '').toLowerCase();
    if (/finance|stock|investment|market|trading|economy|business/.test(text)) return 'finance';
    if (/tech|technology|ai|software|code|digital|machine learning|app|website/.test(text)) return 'technology';
    if (/travel|mountain|river|forest|ocean|nature|waterfall|beach|landscape/.test(text)) return 'nature';
    if (/health|medical|fitness|wellness|exercise|diet|nutrition/.test(text)) return 'health';
    if (/education|learning|school|student|course|training|knowledge/.test(text)) return 'education';
    if (/food|recipe|cooking|restaurant|cuisine|dish|meal/.test(text)) return 'food';
    if (/sport|athlete|game|competition|team|match|championship/.test(text)) return 'sports';
    return 'generic';
  }

  static _extractCoreSubjects(script) {
    const rawText = String(script || '').toLowerCase();
    const cleaned = rawText.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const filler = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'from', 'this', 'that', 'video', 'scene', 'visual']);
    const words = cleaned.split(' ').filter(Boolean);
    const found = [];

    for (let index = 0; index < words.length; index += 1) {
      const current = words[index];
      const next = words[index + 1];
      if (filler.has(current) || current.length < 3) {
        continue;
      }
      const phrase = next && !filler.has(next) && next.length > 2 ? `${current} ${next}` : current;
      if (!found.includes(phrase)) {
        found.push(phrase);
      }
    }

    return found.slice(0, 5).length ? found.slice(0, 5) : ['core concept'];
  }

  static _detectLighting(text, domain, styleName) {
    const normalized = String(text || '').toLowerCase();
    const styleProfile = getStyle(styleName);
    if (/sunrise|dawn|morning/.test(normalized)) return 'golden sunrise';
    if (/sunset|dusk|evening/.test(normalized)) return 'warm sunset';
    if (/night|dark|moon|neon/.test(normalized)) return 'night practical glow';
    if (domain === 'technology') return 'cool digital glow';
    return styleProfile.lightingProfile || 'natural daylight';
  }

  static _normalizeMotion(motion) {
    const valid = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'static'];
    const normalized = String(motion || 'static').toLowerCase().replace(/\s+/g, '_');
    return valid.includes(normalized) ? normalized : 'static';
  }

  static _domainVisualDescriptor(domain) {
    const map = {
      nature: 'landscape depth and natural atmosphere',
      finance: 'business energy and market symbolism',
      technology: 'digital abstraction and futuristic systems',
      health: 'wellness and human vitality',
      education: 'learning atmosphere and knowledge transfer',
      food: 'culinary artistry and appetizing texture',
      sports: 'athletic power and motion intensity',
      generic: 'polished visual storytelling',
    };
    return map[domain] || map.generic;
  }
}

module.exports = SceneService;
