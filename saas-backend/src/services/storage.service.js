const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const PROJECTS_ROOT = path.resolve(BACKEND_ROOT, 'projects');

class StorageService {
  static getDriver() {
    return (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  }

  static async publishArtifact(projectId, filePath, contentType = 'application/octet-stream') {
    if (!filePath) {
      return { objectKey: '', publicUrl: '', storageDriver: this.getDriver() };
    }

    if (this.getDriver() !== 's3') {
      return {
        objectKey: this._objectKeyForProjectFile(projectId, filePath),
        publicUrl: this.getSignedReadUrl(projectId, filePath),
        storageDriver: 'local',
      };
    }

    const objectKey = this._objectKeyForProjectFile(projectId, filePath);
    await this._uploadToS3(filePath, objectKey, contentType);
    return {
      objectKey,
      publicUrl: this.getSignedReadUrl(projectId, filePath, { objectKey }),
      storageDriver: 's3',
    };
  }

  static getSignedReadUrl(projectId, filePath, options = {}) {
    const driver = this.getDriver();
    const objectKey = options.objectKey || this._objectKeyForProjectFile(projectId, filePath);

    if (driver !== 's3') {
      const baseUrl = process.env.BASE_URL || 'http://localhost:5002';
      const normalized = filePath.split(path.sep).join('/');
      const projectIndex = normalized.lastIndexOf(`${projectId}/`);
      const relativePath = projectIndex >= 0 ? normalized.slice(projectIndex + projectId.length + 1) : path.basename(filePath);
      const expiresAt = Date.now() + 15 * 60 * 1000;
      const token = crypto
        .createHmac('sha256', process.env.STORAGE_SIGNING_SECRET || 'local-storage-secret')
        .update(`${projectId}:${relativePath}:${expiresAt}`)
        .digest('hex');
      return `${baseUrl}/videos/${projectId}/${relativePath}?expires=${expiresAt}&signature=${token}`;
    }

    return this._createS3SignedUrl(objectKey, options.expiresIn || 900);
  }

  static _objectKeyForProjectFile(projectId, filePath) {
    const normalized = path.resolve(filePath);
    const projectRoot = path.resolve(PROJECTS_ROOT, projectId);
    const relativePath = path.relative(projectRoot, normalized).split(path.sep).join('/');
    return `${projectId}/${relativePath}`;
  }

  static _createS3SignedUrl(objectKey, expiresInSec) {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const accessKey = process.env.S3_ACCESS_KEY_ID;
    const secretKey = process.env.S3_SECRET_ACCESS_KEY;
    const region = process.env.S3_REGION || 'auto';

    if (!endpoint || !bucket || !accessKey || !secretKey) {
      throw new Error('S3 storage is enabled but credentials are incomplete.');
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const host = new URL(endpoint).host;
    const canonicalUri = `/${bucket}/${objectKey}`;
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const algorithm = 'AWS4-HMAC-SHA256';
    const query = new URLSearchParams({
      'X-Amz-Algorithm': algorithm,
      'X-Amz-Credential': `${accessKey}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSec),
      'X-Amz-SignedHeaders': 'host',
    });
    const canonicalRequest = [
      'GET',
      canonicalUri,
      query.toString(),
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      this._sha256(canonicalRequest),
    ].join('\n');
    const signature = this._awsSignature(secretKey, dateStamp, region, stringToSign);
    query.set('X-Amz-Signature', signature);
    return `${endpoint.replace(/\/$/, '')}${canonicalUri}?${query.toString()}`;
  }

  static async _uploadToS3(filePath, objectKey, contentType) {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const accessKey = process.env.S3_ACCESS_KEY_ID;
    const secretKey = process.env.S3_SECRET_ACCESS_KEY;
    const region = process.env.S3_REGION || 'auto';

    if (!endpoint || !bucket || !accessKey || !secretKey) {
      throw new Error('S3 storage is enabled but credentials are incomplete.');
    }

    const fileBuffer = await fs.readFile(filePath);
    const url = new URL(`${endpoint.replace(/\/$/, '')}/${bucket}/${objectKey}`);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this._sha256(fileBuffer);
    const canonicalHeaders = `content-type:${contentType}\nhost:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'PUT',
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const signature = this._awsSignature(
      secretKey,
      dateStamp,
      region,
      [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        this._sha256(canonicalRequest),
      ].join('\n')
    );
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    await new Promise((resolve, reject) => {
      const request = https.request(
        {
          method: 'PUT',
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: url.pathname,
          headers: {
            'Content-Type': contentType,
            'Content-Length': fileBuffer.length,
            'X-Amz-Date': amzDate,
            'X-Amz-Content-Sha256': payloadHash,
            Authorization: authorization,
          },
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              resolve();
              return;
            }
            reject(new Error(Buffer.concat(chunks).toString('utf8') || `Upload failed with ${response.statusCode}`));
          });
        }
      );

      request.on('error', reject);
      request.write(fileBuffer);
      request.end();
    });
  }

  static _awsSignature(secretKey, dateStamp, region, stringToSign) {
    const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  }

  static _sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

module.exports = StorageService;
