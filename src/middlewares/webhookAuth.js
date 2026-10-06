import crypto from 'node:crypto';
import config from '../config/env.js';

/**
 * Middleware to verify webhook authenticity:
 * 1. Content-Type check (application/json)
 * 2. Webhook secret or HMAC signature check
 * 3. Timestamp freshness check (anti-replay, if header present)
 */
export function verifyWebhookAuth(req, res, next) {
  // 1. Content-Type check
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({
      success: false,
      error: 'Unsupported Media Type',
      message: 'Content-Type must be application/json',
    });
  }

  // 2. Secret / Signature verification
  const bodySecret =
    typeof req.body === 'object' && req.body !== null
      ? (Array.isArray(req.body)
          ? req.body[0]?.secret || req.body[0]?.webhook_secret || req.body[0]?.token
          : req.body.secret || req.body.webhook_secret || req.body.token || req.body.apiKey)
      : null;

  const providedSecret =
    req.headers['x-webhook-secret'] ||
    req.headers['x-plaud-secret'] ||
    req.headers['x-api-key'] ||
    req.query?.secret ||
    req.query?.token ||
    req.query?.apiKey ||
    bodySecret;

  const providedSignature = req.headers['x-plaud-signature'] || req.headers['x-hub-signature-256'];
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  let isAuthenticated = false;

  // Match configured secret/token
  if (config.WEBHOOK_SECRET) {
    const configuredSecret = String(config.WEBHOOK_SECRET).trim();
    if (providedSecret === configuredSecret || bearerToken === configuredSecret) {
      isAuthenticated = true;
    } else if (providedSignature && req.rawBody) {
      // HMAC SHA-256 verification
      try {
        const expectedSignature = crypto
          .createHmac('sha256', configuredSecret)
          .update(req.rawBody)
          .digest('hex');

        const cleanProvided = providedSignature.replace(/^sha256=/, '');
        if (
          cleanProvided.length === expectedSignature.length &&
          crypto.timingSafeEqual(Buffer.from(cleanProvided, 'hex'), Buffer.from(expectedSignature, 'hex'))
        ) {
          isAuthenticated = true;
        }
      } catch (err) {
        console.warn('Signature verification error:', err.message);
      }
    }
  } else {
    // If no secret configured in production, reject; in development warn
    if (config.NODE_ENV === 'production') {
      console.error('❌ [SECURITY ERROR] WEBHOOK_SECRET is not configured in production environment.');
      return res.status(500).json({
        success: false,
        error: 'Server Misconfiguration',
        message: 'WEBHOOK_SECRET is not configured on the server',
      });
    }
    console.warn('⚠️ [SECURITY WARNING] WEBHOOK_SECRET is not configured in environment. Allowing request.');
    isAuthenticated = true;
  }

  if (!isAuthenticated) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or missing webhook secret',
    });
  }

  // 3. Optional Request Timestamp verification (anti-replay check on HTTP headers)
  const timestampHeader = req.headers['x-timestamp'] || req.headers['x-request-timestamp'];
  if (timestampHeader) {
    const requestTime = new Date(timestampHeader).getTime();
    if (!isNaN(requestTime)) {
      const now = Date.now();
      const ageInSeconds = Math.abs(now - requestTime) / 1000;
      if (ageInSeconds > config.WEBHOOK_MAX_AGE_SECONDS) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Webhook timestamp expired or drifted beyond allowed window (${config.WEBHOOK_MAX_AGE_SECONDS}s)`,
        });
      }
    }
  }

  next();
}

export default {
  verifyWebhookAuth,
};
