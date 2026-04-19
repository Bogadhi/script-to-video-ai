const crypto = require('crypto');

class DiversityService {
  static _sessionState = {};

  static reset(projectId) {
    console.log(`[DIVERSITY RESET] projectId=${projectId}`);
    this._sessionState[projectId] = {
      usedAssets: new Set(),
      usedVideoIds: new Set(),
      usedPromptHashes: new Set(),
      usedImageHashes: new Set(),
      sceneVisualLog: [],
    };
  }

  static _getState(projectId) {
    if (!this._sessionState[projectId]) {
      this.reset(projectId);
    }
    return this._sessionState[projectId];
  }

  static _computeHash(data) {
    return crypto.createHash('md5').update(String(data)).digest('hex');
  }

  static _computePerceptualImageHash(buffer) {
    if (!buffer || buffer.length === 0) {
      return 'empty';
    }
    const prefix = buffer.slice(0, Math.min(4096, buffer.length));
    const suffix = buffer.length > 4096 ? buffer.slice(Math.max(0, buffer.length - 4096)) : Buffer.alloc(0);
    const combined = Buffer.concat([prefix, suffix]);
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  static isDuplicate(projectId, assetUrl, assetBuffer = null) {
    const state = this._getState(projectId);

    if (!assetUrl) return false;

    if (state.usedAssets.has(assetUrl)) {
      console.log(`[DIVERSITY CHECK] status=REJECTED reason=URL_ALREADY_USED url=${assetUrl}`);
      return true;
    }

    if (assetBuffer) {
      const hash = this._computePerceptualImageHash(assetBuffer);
      if (state.usedImageHashes.has(hash)) {
        console.log(`[DIVERSITY CHECK] status=REJECTED reason=HASH_COLLISION hash=${hash.slice(0, 8)}`);
        return true;
      }
      state.usedImageHashes.add(hash);
    }

    return false;
  }

  static register(projectId, assetUrl, assetType = 'image', metadata = {}) {
    const state = this._getState(projectId);
    state.usedAssets.add(assetUrl);

    const logEntry = {
      timestamp: new Date().toISOString(),
      assetUrl,
      assetType,
      ...metadata,
    };
    state.sceneVisualLog.push(logEntry);

    console.log(
      `[DIVERSITY REGISTER] projectId=${projectId} assetType=${assetType} url=${assetUrl}`
    );
  }

  static registerPromptHash(projectId, prompt) {
    const state = this._getState(projectId);
    const hash = this._computeHash(prompt);
    state.usedPromptHashes.add(hash);
    return hash;
  }

  static isPromptDuplicate(projectId, prompt) {
    const state = this._getState(projectId);
    const hash = this._computeHash(prompt);
    return state.usedPromptHashes.has(hash);
  }

  static logSceneVisual(projectId, sceneId, sourceType, url, metadata = {}) {
    const state = this._getState(projectId);
    console.log(
      `[SCENE VISUAL SELECTED] scene_id=${sceneId} source=${sourceType} url=${url}`
    );
    state.sceneVisualLog.push({
      sceneId,
      sourceType,
      url,
      ...metadata,
      timestamp: new Date().toISOString(),
    });
  }

  static getSummary(projectId) {
    const state = this._getState(projectId);
    const sources = state.sceneVisualLog
      .map((log) => log.sourceType)
      .filter(Boolean);
    const uniqueSources = [...new Set(sources)];

    return {
      totalScenes: state.sceneVisualLog.length,
      sources: uniqueSources,
      sourceDistribution: sources.reduce((acc, src) => {
        acc[src] = (acc[src] || 0) + 1;
        return acc;
      }, {}),
      visualLog: state.sceneVisualLog,
    };
  }

  static cleanup(projectId) {
    if (this._sessionState[projectId]) {
      delete this._sessionState[projectId];
      console.log(`[DIVERSITY CLEANUP] projectId=${projectId}`);
    }
  }
}

module.exports = DiversityService;
