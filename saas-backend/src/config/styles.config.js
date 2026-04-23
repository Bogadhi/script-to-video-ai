const STYLES = {
  cinematic: {
    label: 'Cinematic',
    sdModifiers: 'dramatic lighting, HDR, depth of field, film grain, anamorphic lens, cinematic color grading, ultra detailed',
    pexelsQueryTags: ['cinematic', 'dramatic', 'cinematography'],
    pixabayQueryTags: ['cinematic', 'dramatic', 'professional'],
    negativePromptAdditions: 'cartoon, anime, sketch, watermark, text overlay',
    colorGrading: 'warm highlights, cool shadows, saturated colors',
  },
  anime: {
    label: 'Anime',
    sdModifiers: 'illustrated, stylized, cel-shaded, vibrant flat colors, anime art style, hand-drawn, animation',
    pexelsQueryTags: ['art', 'illustration', 'creative'],
    pixabayQueryTags: ['art', 'illustration', 'animation'],
    negativePromptAdditions: 'photorealistic, photograph, real, blurry, low quality',
    colorGrading: 'bright saturation, vibrant hues, high contrast',
  },
  realistic: {
    label: 'Realistic',
    sdModifiers: 'photorealistic, natural colors, shallow depth of field, neutral color grading, documentary style, authentic',
    pexelsQueryTags: ['realistic', 'natural', 'documentary'],
    pixabayQueryTags: ['realistic', 'natural', 'professional'],
    negativePromptAdditions: 'cartoon, anime, exaggerated, unrealistic, distorted',
    colorGrading: 'neutral tones, natural lighting, balanced exposure',
  },
  documentary: {
    label: 'Documentary',
    sdModifiers: 'documentary photography, journalistic, raw, authentic, natural lighting, real world, observational',
    pexelsQueryTags: ['documentary', 'nature', 'lifestyle'],
    pixabayQueryTags: ['documentary', 'lifestyle', 'real'],
    negativePromptAdditions: 'anime, illustrated, cartoon, stylized, artificial',
    colorGrading: 'flat profile, earth tones, muted colors',
  },
  corporate: {
    label: 'Corporate',
    sdModifiers: 'professional, clean aesthetic, corporate branding, business environment, modern design, minimalist',
    pexelsQueryTags: ['business', 'corporate', 'professional'],
    pixabayQueryTags: ['business', 'corporate', 'office'],
    negativePromptAdditions: 'cartoon, anime, sketch, casual, unprofessional',
    colorGrading: 'desaturated tones, professional lighting, corporate color schemes',
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
