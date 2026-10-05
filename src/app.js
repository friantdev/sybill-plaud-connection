import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { handleWebhook } from './controllers/webhookController.js';
import { getTranscriptPreview } from './controllers/previewController.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { connectDB } from './config/db.js';

const app = express();

// Security middlewares
app.use(helmet());
app.use(cors());

// Log incoming request details for debugging on Vercel
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} url: ${req.url} | originalUrl: ${req.originalUrl}`);
  // If Vercel serverless runtime already parsed the body, mark it so express.json doesn't hang
  if (req.body && !req._body) {
    req._body = true;
  }
  next();
});

// Parse JSON body with rawBody retention
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure DB is connected for every request (cached in serverless)
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

// Transcript preview endpoints for Postman testing (GET & POST)
const previewPaths = [
  '/api/transcript-preview',
  '/api/v1/transcript-preview',
  '/api/preview',
  '/preview',
  '/transcript-preview',
];
app.get(previewPaths, getTranscriptPreview);
app.post(previewPaths, getTranscriptPreview);

// Route ANY POST request on the server to handleWebhook
// (Ensures Zapier hits to /webhook, /api/webhooks/plaud, /api, or any path will always be processed)
app.use((req, res, next) => {
  if (req.method === 'POST') {
    return handleWebhook(req, res, next);
  }
  next();
});

// Root / health check endpoint for GET requests
app.get('/', (req, res) => {
  res.json({
    service: 'PLAUD-to-Sybill Integration API',
    status: 'online',
    database: {
      connected: mongoose.connection.readyState === 1,
      name: mongoose.connection.name || null,
      host: mongoose.connection.host || null,
    },
    webhook: 'Send POST to any endpoint (e.g. POST /webhook or POST /api/v1/webhooks/plaud)',
  });
});

app.get('/api', (req, res) => {
  res.json({
    service: 'PLAUD-to-Sybill Integration API',
    status: 'online',
    database: {
      connected: mongoose.connection.readyState === 1,
      name: mongoose.connection.name || null,
    },
  });
});

// 404 handler for non-POST unmatched requests
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
