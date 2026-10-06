import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { handleWebhook } from './controllers/webhookController.js';
import { verifyWebhookAuth } from './middlewares/webhookAuth.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { connectDB } from './config/db.js';

const app = express();

// Security middlewares
app.use(helmet());
app.use(cors());

// Log incoming request details for debugging on serverless/cloud environments
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} url: ${req.url} | originalUrl: ${req.originalUrl}`);
  if (req.body && !req._body) {
    req._body = true;
  }
  next();
});

// Parse JSON body with rawBody retention for HMAC signature verification
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure DB is connected for every request (cached in serverless warm starts)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection failed in middleware:', err.message);
    res.status(503).json({
      error: 'Database Unavailable',
      message: 'Failed to establish connection to database',
    });
  }
});

// Root & Health check endpoints
const healthHandler = (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.status(isConnected ? 200 : 503).json({
    service: 'PLAUD-to-Sybill Integration API',
    status: isConnected ? 'online' : 'degraded',
    database: {
      connected: isConnected,
      name: mongoose.connection.name || null,
      host: mongoose.connection.host || null,
    },
    timestamp: new Date().toISOString(),
  });
};

app.get(['/', '/api', '/api/v1/health', '/health'], healthHandler);

// Webhook endpoint with secret verification
app.post(
  ['/api/v1/webhooks/plaud', '/webhook', '/api/webhook', '/api/webhooks'],
  verifyWebhookAuth,
  handleWebhook
);

// Fallback for any other POST requests (verifies secret, then processes webhook)
app.use((req, res, next) => {
  if (req.method === 'POST') {
    return verifyWebhookAuth(req, res, () => handleWebhook(req, res, next));
  }
  next();
});

// 404 handler for unmatched requests
app.use((req, res) => {
  console.warn(`[404 NOT MATCHED] ${req.method} url: ${req.url} | originalUrl: ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl || req.url}`,
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;
