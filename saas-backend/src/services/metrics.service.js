const Metrics = require('../lib/metrics');

const DEFAULT_PRICING = {
  openrouter: {
    inputPer1k: Number(process.env.OPENROUTER_INPUT_PER_1K || 0),
    outputPer1k: Number(process.env.OPENROUTER_OUTPUT_PER_1K || 0),
  },
  nvidia: {
    requestUsd: Number(process.env.NVIDIA_TTS_REQUEST_USD || 0),
  },
  stability: {
    imageUsd: Number(process.env.STABILITY_IMAGE_USD || 0),
  },
};

class MetricsService {
  static logApiCost(projectId, provider, payload = {}) {
    const normalizedProvider = String(provider || 'unknown').toLowerCase();
    const costUsd = Number(payload.costUsd || 0);
    Metrics.recordApiCost(projectId || 'unknown', normalizedProvider, {
      costUsd,
      units: payload.units || 0,
      requests: payload.requests || 1,
      meta: payload.meta || {},
    });
    console.log(`[Metrics] project=${projectId || 'unknown'} provider=${normalizedProvider} costUsd=${costUsd.toFixed(6)}`);
  }

  static estimateOpenRouterCost(usage = {}) {
    const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
    const costUsd =
      (promptTokens / 1000) * DEFAULT_PRICING.openrouter.inputPer1k +
      (completionTokens / 1000) * DEFAULT_PRICING.openrouter.outputPer1k;

    return {
      costUsd,
      promptTokens,
      completionTokens,
    };
  }

  static estimateNvidiaTtsCost() {
    return {
      costUsd: DEFAULT_PRICING.nvidia.requestUsd,
      requests: 1,
    };
  }

  static estimateStabilityCost(imageCount = 1) {
    return {
      costUsd: DEFAULT_PRICING.stability.imageUsd * Math.max(1, imageCount),
      requests: Math.max(1, imageCount),
    };
  }
}

module.exports = MetricsService;
