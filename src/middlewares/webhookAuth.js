import crypto from 'node:crypto';
import config from '../config/env.js';

/**
 * Middleware to verify webhook authenticity:
 * 1. Content-Type check (application/json)
 * 2. Webhook secret or HMAC signature check
 * 3. Timestamp freshness check (anti-replay)
 */
export function verifyWebhookAuth(req, res, next) {
  // 1. Content-Type check
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({
      error: 'Unsupported Media Type',
      message: 'Content-Type must be application/json',
    });
  }

  // 2. Secret / Signature verification
  const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-plaud-secret'];
  const providedSignature = req.headers['x-plaud-signature'] || req.headers['x-hub-signature-256'];
  const authHeader = req.headers['authorization'] || '';

  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  let isAuthenticated = false;

  // Match direct secret/token
  if (config.WEBHOOK_SECRET) {
    if (providedSecret === config.WEBHOOK_SECRET || bearerToken === config.WEBHOOK_SECRET) {
      isAuthenticated = true;
    } else if (providedSignature && req.rawBody) {
      // HMAC SHA-256 verification
      const expectedSignature = crypto
        .createHmac('sha256', config.WEBHOOK_SECRET)
        .update(req.rawBody)
        .digest('hex');

      const cleanProvided = providedSignature.replace(/^sha256=/, '');
      if (crypto.timingSafeEqual(Buffer.from(cleanProvided, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
        isAuthenticated = true;
      }
    }
  } else {
    // If no secret configured (dev mode), permit with warning
    isAuthenticated = true;
  }

  if (!isAuthenticated) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid webhook secret or signature',
    });
  }

  // 3. Timestamp verification (anti-replay check)
  const timestampHeader = req.headers['x-timestamp'] || req.headers['x-request-timestamp'] || req.body?.timestamp;
  if (timestampHeader) {
    const requestTime = new Date(timestampHeader).getTime();
    if (!isNaN(requestTime)) {
      const now = Date.now();
      const ageInSeconds = Math.abs(now - requestTime) / 1000;
      if (ageInSeconds > config.WEBHOOK_MAX_AGE_SECONDS) {
        return res.status(400).json({
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
