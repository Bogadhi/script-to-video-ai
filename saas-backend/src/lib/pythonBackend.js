const DEFAULT_TIMEOUT_MS = 30000;

function getPythonBackendUrl() {
  const baseUrl = process.env.PYTHON_BACKEND_URL;
  if (!baseUrl) {
    throw new Error('PYTHON_BACKEND_URL is not configured.');
  }

  return baseUrl.replace(/\/+$/, '');
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : {};
}

async function requestPython(path, options = {}) {
  const {
    method = 'GET',
    authHeader,
    jsonBody,
    formBody,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {};
  let body;

  if (authHeader) {
    headers.Authorization = authHeader;
  }

  if (formBody) {
    const params = new URLSearchParams();
    Object.entries(formBody).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = params;
  } else if (jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(jsonBody);
  }

  try {
    const response = await fetch(`${getPythonBackendUrl()}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const data = await parseResponse(response);
    if (!response.ok) {
      const error = new Error(data.detail || data.message || `Python backend request failed with ${response.status}.`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Python backend request timed out after ${timeoutMs}ms.`);
      timeoutError.status = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createVideoProject(payload, authHeader) {
  return requestPython('/api/scripts/create', {
    method: 'POST',
    authHeader,
    formBody: payload,
    timeoutMs: 45000,
  });
}

function getPipelineStatus(projectId, authHeader) {
  return requestPython(`/api/pipeline/${projectId}/status`, {
    method: 'GET',
    authHeader,
    timeoutMs: 15000,
  });
}

function getPipelineResult(projectId, authHeader) {
  return requestPython(`/api/pipeline/${projectId}/result`, {
    method: 'GET',
    authHeader,
    timeoutMs: 15000,
  });
}

function getPipelineMetadata(projectId, authHeader) {
  return requestPython(`/api/pipeline/${projectId}/metadata`, {
    method: 'GET',
    authHeader,
    timeoutMs: 15000,
  });
}

function retryPipeline(projectId, authHeader) {
  return requestPython(`/api/pipeline/${projectId}/retry`, {
    method: 'POST',
    authHeader,
    jsonBody: {},
    timeoutMs: 15000,
  });
}

function submitPipelineFeedback(projectId, payload, authHeader) {
  return requestPython(`/api/pipeline/${projectId}/feedback`, {
    method: 'POST',
    authHeader,
    jsonBody: payload,
    timeoutMs: 15000,
  });
}

module.exports = {
  createVideoProject,
  getPipelineMetadata,
  getPipelineResult,
  getPipelineStatus,
  requestPython,
  retryPipeline,
  submitPipelineFeedback,
};
