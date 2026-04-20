const STYLES = {
  cinematic: {
    label: 'Cinematic',
    sdModifiers: 'dramatic lighting, HDR, depth of field, film grain, anamorphic lens, cinematic color grading, ultra detailed',
    pexelsQueryTags: ['cinematic', 'dramatic', 'cinematography'],
    pixabayQueryTags: ['cinematic', 'dramatic', 'professional'],
    negativePromptAdditions: 'cartoon, anime, sketch, watermark, text overlay',
    colorGrading: 'warm highlights, cool shadows, saturated colors',
    lensPrompt: '35mm anamorphic lens, shallow depth of field',
    lightingProfile: 'golden hour edge light, deep cinematic contrast',
    textureProfile: 'filmic grain, premium commercial finish',
  },
  anime: {
    label: 'Anime',
    sdModifiers: 'illustrated, stylized, cel-shaded, vibrant flat colors, anime art style, hand-drawn, animation',
    pexelsQueryTags: ['art', 'illustration', 'creative'],
    pixabayQueryTags: ['art', 'illustration', 'animation'],
    negativePromptAdditions: 'photorealistic, photograph, real, blurry, low quality',
    colorGrading: 'bright saturation, vibrant hues, high contrast',
    lensPrompt: 'dynamic anime perspective, telephoto compression',
    lightingProfile: 'stylized rim light, vivid sky bounce',
    textureProfile: 'clean cel shading, graphic ink lines',
  },
  realistic: {
    label: 'Realistic',
    sdModifiers: 'photorealistic, natural colors, shallow depth of field, neutral color grading, documentary style, authentic',
    pexelsQueryTags: ['realistic', 'natural', 'documentary'],
    pixabayQueryTags: ['realistic', 'natural', 'professional'],
    negativePromptAdditions: 'cartoon, anime, exaggerated, unrealistic, distorted',
    colorGrading: 'neutral tones, natural lighting, balanced exposure',
    lensPrompt: '50mm documentary lens, natural perspective',
    lightingProfile: 'soft daylight realism, balanced exposure',
    textureProfile: 'true-to-life texture, restrained polish',
  },
  documentary: {
    label: 'Documentary',
    sdModifiers: 'documentary photography, journalistic, raw, authentic, natural lighting, real world, observational',
    pexelsQueryTags: ['documentary', 'nature', 'lifestyle'],
    pixabayQueryTags: ['documentary', 'lifestyle', 'real'],
    negativePromptAdditions: 'anime, illustrated, cartoon, stylized, artificial',
    colorGrading: 'flat profile, earth tones, muted colors',
    lensPrompt: 'handheld documentary lens, observational framing',
    lightingProfile: 'available light realism, practical highlights',
    textureProfile: 'journalistic texture, grounded realism',
  },
  corporate: {
    label: 'Corporate',
    sdModifiers: 'professional, clean aesthetic, corporate branding, business environment, modern design, minimalist',
    pexelsQueryTags: ['business', 'corporate', 'professional'],
    pixabayQueryTags: ['business', 'corporate', 'office'],
    negativePromptAdditions: 'cartoon, anime, sketch, casual, unprofessional',
    colorGrading: 'desaturated tones, professional lighting, corporate color schemes',
    lensPrompt: 'clean 50mm commercial lens, polished focus',
    lightingProfile: 'softbox commercial lighting, premium office glow',
    textureProfile: 'minimal premium surfaces, brand-safe finish',
  },
};

function getStyle(styleName = 'cinematic') {
  return STYLES[styleName] || STYLES.cinematic;
}

function getStyleNames() {
  return Object.keys(STYLES);
}

module.exports = {
  STYLES,
  getStyle,
  getStyleNames,
};
