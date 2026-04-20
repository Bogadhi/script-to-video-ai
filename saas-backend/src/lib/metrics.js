const metricsState = {
  renderStarted: 0,
  renderCompleted: 0,
  renderFailed: 0,
  totalRenderDurationMs: 0,
  apiRequestsTotal: 0,
  apiCostUsdTotal: 0,
  providerCosts: {},
  projectCosts: {},
};

class Metrics {
  static markRenderStarted() {
    metricsState.renderStarted += 1;
  }

  static markRenderCompleted(durationMs) {
    metricsState.renderCompleted += 1;
    metricsState.totalRenderDurationMs += Math.max(0, durationMs || 0);
  }

  static markRenderFailed(durationMs) {
    metricsState.renderFailed += 1;
    metricsState.totalRenderDurationMs += Math.max(0, durationMs || 0);
  }

  static markApiRequest() {
    metricsState.apiRequestsTotal += 1;
  }

  static recordApiCost(projectId, provider, payload = {}) {
    const normalizedProvider = String(provider || 'unknown').toLowerCase();
    const costUsd = Number(payload.costUsd || 0);
    const requests = Number(payload.requests || 1);

    metricsState.apiCostUsdTotal += costUsd;
    metricsState.providerCosts[normalizedProvider] = metricsState.providerCosts[normalizedProvider] || {
      costUsd: 0,
      requests: 0,
    };
    metricsState.providerCosts[normalizedProvider].costUsd += costUsd;
    metricsState.providerCosts[normalizedProvider].requests += requests;

    if (projectId) {
      metricsState.projectCosts[projectId] = metricsState.projectCosts[projectId] || {
        costUsd: 0,
        requests: 0,
      };
      metricsState.projectCosts[projectId].costUsd += costUsd;
      metricsState.projectCosts[projectId].requests += requests;
    }
  }

  static snapshot() {
    const completed = metricsState.renderCompleted || 0;
    return {
      ...metricsState,
      avgRenderDurationMs: completed > 0 ? metricsState.totalRenderDurationMs / completed : 0,
    };
  }

  static toPrometheus() {
    const snapshot = this.snapshot();
    return [
      '# HELP bogadhi_api_requests_total Total API requests handled by the backend',
      '# TYPE bogadhi_api_requests_total counter',
      `bogadhi_api_requests_total ${snapshot.apiRequestsTotal}`,
      '# HELP bogadhi_render_jobs_started_total Total render jobs started',
      '# TYPE bogadhi_render_jobs_started_total counter',
      `bogadhi_render_jobs_started_total ${snapshot.renderStarted}`,
      '# HELP bogadhi_render_jobs_completed_total Total render jobs completed',
      '# TYPE bogadhi_render_jobs_completed_total counter',
      `bogadhi_render_jobs_completed_total ${snapshot.renderCompleted}`,
      '# HELP bogadhi_render_jobs_failed_total Total render jobs failed',
      '# TYPE bogadhi_render_jobs_failed_total counter',
      `bogadhi_render_jobs_failed_total ${snapshot.renderFailed}`,
      '# HELP bogadhi_render_duration_avg_ms Average completed render duration in milliseconds',
      '# TYPE bogadhi_render_duration_avg_ms gauge',
      `bogadhi_render_duration_avg_ms ${snapshot.avgRenderDurationMs.toFixed(2)}`,
      '# HELP bogadhi_api_cost_total_usd Total tracked external API cost in USD',
      '# TYPE bogadhi_api_cost_total_usd gauge',
      `bogadhi_api_cost_total_usd ${snapshot.apiCostUsdTotal.toFixed(6)}`,
    ].join('\n');
  }
}

module.exports = Metrics;
