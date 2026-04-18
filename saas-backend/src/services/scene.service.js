const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

class SceneService {
  static _getVisualFocus(index) {
    const visualFocusOptions = [
      "wide aerial establishing shot",
      "medium environmental shot",
      "close-up detail shot",
      "dynamic motion perspective",
      "cinematic closing wide shot"
    ];
    return visualFocusOptions[index % 5];
  }

  static async generateScenes(script, category = 'storytelling') {
    console.log('[SceneService] Generating context-aware scenes...');
    const domain = this._detectDomain(script);
    const coreSubjects = this._extractCoreSubjects(script);
    const lighting = this._detectLighting(script, domain);

    try {
      const scenes = await this._generateWithOpenRouter(script, category, coreSubjects, domain, lighting);
      if (scenes && scenes.length > 0) {
        let aiScenes = this._normalizeScenes(this._enforceSubjectConsistency(scenes, coreSubjects, lighting, domain));
        if (aiScenes.length < 4) {
            const baseScene = aiScenes[0];
            const baseSubjects = baseScene?.keywords || ["visual"];
            while (aiScenes.length < 5) {
                aiScenes.push({
                    ...baseScene,
                    scene_id: aiScenes.length + 1,
                    visual_prompt: baseScene.visual_prompt + ", different composition",
                    keywords: baseSubjects,
                    duration: 3 + (aiScenes.length % 2)
                });
            }
        }
        aiScenes = this._normalizeScenes(aiScenes);
        console.log('[SCENE SERVICE OUTPUT]', aiScenes.length);
        console.log('[SCENE COUNT]', aiScenes.length);
        return aiScenes;
      }
    } catch (err) {
      console.warn('[SceneService] OpenRouter failed:', err.message);
    }

    const fallback = this._keywordAwareSplitter(script, category, coreSubjects, domain, lighting);
    let fallbackScenes = this._normalizeScenes(this._enforceSubjectConsistency(fallback, coreSubjects, lighting, domain));
    
    if (fallbackScenes.length < 4) {
        const baseScene = fallbackScenes[0];
        const baseSubjects = baseScene?.keywords || ["visual"];
        while (fallbackScenes.length < 5) {
            fallbackScenes.push({
                ...baseScene,
                scene_id: fallbackScenes.length + 1,
                visual_prompt: baseScene.visual_prompt + ", different composition",
                keywords: baseSubjects,
                duration: 3 + (fallbackScenes.length % 2)
            });
        }
    }
    fallbackScenes = this._normalizeScenes(fallbackScenes);
    console.log('[SCENE SERVICE OUTPUT]', fallbackScenes.length);
    console.log('[SCENE COUNT]', fallbackScenes.length);
    return fallbackScenes;
  }

  static _normalizeScenes(scenes) {
    return (Array.isArray(scenes) ? scenes : [])
      .filter(Boolean)
      .map((scene, index) => ({
        ...scene,
        scene: index + 1,
        scene_id: index + 1,
      }));
  }

  static async _generateWithOpenRouter(script, category, coreSubjects, domain, lighting) {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set');
    }

    const subjectText = coreSubjects.join(', ');
    const allowPeople = domain !== 'nature';

    const systemPrompt = `You are a cinematic scene generator for short-form AI videos.

HARD CONSTRAINTS:
- Domain: ${domain}.
- Every scene must stay on the same topic family: ${subjectText}.
- Keep lighting and atmosphere consistent.
- Each scene must focus on a different aspect of the subject.
- Preserve cinematic camera variation and continuity.
- ${allowPeople ? 'People may appear if relevant to the domain.' : 'Do not include people unless the script explicitly requires them.'}
- Output only valid JSON array with no markdown.`;

    const userPrompt = `Break this script into 4-7 cinematic scenes for a ${category} video.

SCRIPT:
"""
${script.trim().slice(0, 2500)}
"""

Return JSON array items:
{
  "scene_id": 1,
  "narration": "10-30 words",
  "visual_prompt": "cinematic visual for one aspect of ${subjectText}",
  "keywords": ["${coreSubjects[0] || 'visual'}", "${coreSubjects[1] || coreSubjects[0] || 'concept'}"],
  "camera_motion": "zoom_in|zoom_out|pan_left|pan_right|static",
  "mood": "epic|mysterious|energetic|calm|somber",
  "lighting": "${lighting}",
  "style": "cinematic realism, ultra detailed, 8k",
  "composition": "wide|medium|close-up",
  "continuity_hint": "same topic, different aspect",
  "duration": 4
}

Scene variation guidance:
- Finance: overview, charts, trading screens, growth concept, outcome
- Technology: overview, interface, code/data flow, AI concept, end-state
- Nature: overview, terrain, detail, motion, atmosphere
- Generic: overview, process, detail, contrast, result`;

    const response = await axios.post(
      OPENROUTER_URL,
      {
        model: 'mistralai/mistral-small-3.1-24b-instruct:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2500,
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

    return parsed.map((s, i) => {
      const aspect = this._resolveSceneAspect(domain, i);
      const composition = this._normalizeComposition(s.composition, aspect);
      const visual_focus = this._getVisualFocus(i);
      const baseVisualPrompt = this._buildVisualPrompt({
        domain,
        subjects: coreSubjects,
        composition,
        aspect,
        lighting,
      });
      const visualPrompt = `${baseVisualPrompt}, camera angle: ${visual_focus}, different from previous scene, unique composition`;

      return {
        scene: i + 1,
        scene_id: s.scene_id || i + 1,
        text: s.narration || '',
        narration: s.narration || '',
        visual_focus,
        visual_prompt: visualPrompt,
        keywords: coreSubjects,
        domain,
        negative_prompt: this._buildNegativePrompt(domain),
        camera_motion: this._normalizeMotion(s.camera_motion),
        mood: (s.mood || 'calm').toLowerCase(),
        lighting,
        style: 'photorealistic, ultra detailed, 4k',
        composition,
        continuity_hint: `LOCKED: ${subjectText}. Same domain, same lighting, different aspect: ${aspect}.`,
        duration: this._getAdaptiveDuration(visualPrompt, s.narration || ''),
      };
    });
  }

  static _keywordAwareSplitter(script, category, coreSubjects, domain, lighting) {
    const subjectText = coreSubjects.join(', ');
    const sentences = script
      .replace(/([.!?])\s+/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    const target = Math.min(7, Math.max(3, Math.ceil((sentences.length || 3) / 2)));
    const groups = [];
    const batchSize = Math.max(1, Math.ceil((sentences.length || 1) / target));

    for (let i = 0; i < sentences.length; i += batchSize) {
      const group = sentences.slice(i, i + batchSize).join(' ').trim();
      if (group) {
        groups.push(group);
      }
    }

    while (groups.length < 3) {
      groups.push(sentences[sentences.length - 1] || script.slice(0, 80));
    }

    return groups.map((text, i) => {
      const aspect = this._resolveSceneAspect(domain, i);
      const composition = this._compositionForAspect(aspect);
      const visual_focus = this._getVisualFocus(i);
      const baseVisualPrompt = this._buildVisualPrompt({
        domain,
        subjects: coreSubjects,
        composition,
        aspect,
        lighting,
      });
      const visualPrompt = `${baseVisualPrompt}, camera angle: ${visual_focus}, different from previous scene, unique composition`;

      return {
        scene: i + 1,
        scene_id: i + 1,
        text,
        narration: text,
        visual_focus,
        visual_prompt: visualPrompt,
        keywords: coreSubjects,
        domain,
        negative_prompt: this._buildNegativePrompt(domain),
        camera_motion: ['zoom_in', 'pan_right', 'static', 'zoom_out', 'pan_left'][i % 5],
        mood: ['calm', 'epic', 'mysterious', 'calm', 'somber'][i % 5],
        lighting,
        style: 'photorealistic, ultra detailed, 4k',
        composition,
        continuity_hint: `LOCKED: ${subjectText}. Same domain, same lighting, different aspect: ${aspect}.`,
        duration: this._getAdaptiveDuration(visualPrompt, text),
      };
    });
  }

  static _enforceSubjectConsistency(scenes, coreSubjects, globalLighting, domain) {
    const subjectText = coreSubjects.join(', ');

    return scenes.map((scene, index) => {
      const visual = String(scene.visual_prompt || '').toLowerCase();
      const hasAnySubject = coreSubjects.some((s) => visual.includes(String(s).toLowerCase()));
      const composition = this._normalizeComposition(scene.composition, this._resolveSceneAspect(domain, index));
      const aspect = this._resolveSceneAspect(domain, index);
      const visual_focus = this._getVisualFocus(index);

      const baseVisual = hasAnySubject
        ? scene.visual_prompt
        : this._buildVisualPrompt({
            domain,
            subjects: coreSubjects,
            composition,
            aspect,
            lighting: globalLighting,
          });
      const finalVisual = baseVisual.includes('different from previous scene')
        ? baseVisual
        : `${baseVisual}, camera angle: ${visual_focus}, different from previous scene, unique composition`;

      return {
        ...scene,
        visual_focus,
        visual_prompt: finalVisual,
        keywords: coreSubjects,
        domain,
        negative_prompt: this._buildNegativePrompt(domain),
        lighting: globalLighting,
        style: 'photorealistic, ultra detailed, 4k',
        composition,
        continuity_hint: `LOCKED: ${subjectText}. Same domain, same lighting, different aspect: ${aspect}.`,
        duration: this._getAdaptiveDuration(finalVisual, scene.narration || scene.text || ''),
      };
    });
  }

  static _buildVisualPrompt({ domain, subjects, composition, aspect, lighting }) {
    const subjectText = subjects.join(', ');
    const domainDescriptor = this._domainVisualDescriptor(domain);
    const peopleClause = domain === 'nature' ? 'no people, no humans' : 'domain-appropriate presence allowed';

    return `Ultra realistic cinematic ${composition} of ${subjectText}, focus on ${aspect}, ${domainDescriptor}, lighting: ${lighting}, ${peopleClause}, high detail, 4k, photorealistic`;
  }

  static _buildNegativePrompt(domain) {
    const common = ['text', 'watermark', 'blurry', 'low quality', 'cartoon', 'anime', 'sketch'];
    if (domain === 'nature') {
      return [...common, 'people', 'human', 'portrait', 'indoor', 'studio', 'city', 'building'].join(', ');
    }
    return [...common, 'distorted anatomy', 'broken hands', 'deformed face'].join(', ');
  }

  static _getAdaptiveDuration(visualPrompt, text = '') {
    const prompt = String(visualPrompt || '').toLowerCase();
    const wordCount = String(text).split(/\s+/).filter(Boolean).length;
    let weightDuration = 3.5;

    if (/close-up|close up|detail/.test(prompt)) {
      weightDuration = 2.5;
    } else if (/aerial|wide|overview|panorama/.test(prompt)) {
      weightDuration = 4.5;
    }

    const narrationDuration = Math.max(2, Math.min(5, wordCount * 0.4));
    return Math.max(2, Math.min(5, Math.max(narrationDuration, weightDuration)));
  }

  static _detectDomain(script) {
    const text = String(script || '').toLowerCase();
    if (/finance|stock|investment|market|trading|economy/.test(text)) return 'finance';
    if (/tech|technology|ai|software|code|digital|machine learning/.test(text)) return 'technology';
    if (/travel|mountain|river|forest|ocean|nature|waterfall/.test(text)) return 'nature';
    return 'generic';
  }

  static _extractCoreSubjects(script) {
    const rawText = String(script || '').toLowerCase();
    const cleaned = rawText
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const filler = new Set([
      'cinematic', 'beautiful', 'amazing', 'epic', 'stunning', 'dramatic',
      'the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'from', 'into',
      'over', 'under', 'through', 'about', 'this', 'that', 'these', 'those',
      'very', 'really', 'just', 'video', 'scene', 'visual', 'story',
    ]);

    const phrasePatterns = [
      /\b(stock market|financial growth|market trends|trading screens|data visualization|artificial intelligence|machine learning|software development|digital interface|user interface|travel destination|natural landscape|mountain range|river valley|economic growth|business strategy|cloud computing|robotics system)\b/g,
    ];

    const found = [];
    for (const pattern of phrasePatterns) {
      const matches = cleaned.match(pattern) || [];
      for (const match of matches) {
        if (!found.includes(match)) {
          found.push(match);
        }
      }
    }

    const words = cleaned.split(' ').filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const current = words[i];
      const next = words[i + 1];

      if (filler.has(current) || current.length < 3) {
        continue;
      }

      const phrase = next && !filler.has(next) && next.length > 2
        ? `${current} ${next}`
        : current;

      if (!found.includes(phrase)) {
        found.push(phrase);
      }
    }

    const meaningful = found
      .map((item) => item.trim())
      .filter((item) => item.length > 2 && !filler.has(item))
      .filter((item, index, arr) => arr.indexOf(item) === index);

    return meaningful.slice(0, 5).length > 0 ? meaningful.slice(0, 5) : ['core concept'];
  }

  static _detectLighting(text, domain) {
    const t = String(text || '').toLowerCase();
    if (/sunrise|dawn|morning/.test(t)) return 'golden sunrise';
    if (/sunset|dusk|evening/.test(t)) return 'warm sunset';
    if (/night|dark|moon/.test(t)) return 'night ambience';
    if (domain === 'technology') return 'cool digital glow';
    if (domain === 'finance') return 'clean professional lighting';
    return 'natural daylight';
  }

  static _normalizeMotion(motion) {
    const valid = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'static'];
    const normalized = String(motion || 'static').toLowerCase().replace(/\s+/g, '_');
    return valid.includes(normalized) ? normalized : 'static';
  }

  static _normalizeComposition(composition, aspect) {
    const normalized = String(composition || '').toLowerCase();
    if (normalized.includes('close-up') || normalized.includes('close up') || normalized.includes('detail')) {
      return 'close-up detail shot';
    }
    if (normalized.includes('wide') || normalized.includes('aerial') || normalized.includes('overview')) {
      return 'wide overview shot';
    }
    if (normalized.includes('medium')) {
      return 'medium cinematic shot';
    }
    return this._compositionForAspect(aspect);
  }

  static _compositionForAspect(aspect) {
    if (/overview|outcome/.test(aspect)) return 'wide overview shot';
    if (/detail|chart|screen|interface|process/.test(aspect)) return 'close-up detail shot';
    return 'medium cinematic shot';
  }

  static _resolveSceneAspect(domain, index) {
    const domainAspects = {
      finance: ['market overview', 'chart detail', 'trading screen', 'growth concept', 'success outcome'],
      technology: ['technology overview', 'interface detail', 'data flow', 'AI concept', 'future outcome'],
      nature: ['environment overview', 'terrain detail', 'natural motion', 'atmospheric texture', 'destination outcome'],
      generic: ['topic overview', 'core process', 'key detail', 'contrast moment', 'result outcome'],
    };

    const aspects = domainAspects[domain] || domainAspects.generic;
    return aspects[index % aspects.length];
  }

  static _domainVisualDescriptor(domain) {
    const map = {
      nature: 'landscape depth, natural environment, travel atmosphere',
      finance: 'business energy, market symbolism, data-driven composition',
      technology: 'digital abstraction, futuristic interface, advanced systems',
      generic: 'cinematic visual representation, symbolic storytelling, polished composition',
    };
    return map[domain] || map.generic;
  }
}

module.exports = SceneService;
