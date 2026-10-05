import 'dotenv/config';

const config = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_MONGODB_URI: process.env.DB_MONGODB_URI || process.env.MONGODB_URI || 'mongodb+srv://devouttest4_db_user:0PYWaJycLBE3By7Y@sybill.ii6ewti.mongodb.net/plaud_sybill_db?retryWrites=true&w=majority',

  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'test_plaud_secret_key_12345',
  WEBHOOK_MAX_AGE_SECONDS: parseInt(process.env.WEBHOOK_MAX_AGE_SECONDS, 10) || 300,

  ADMIN_API_KEY: process.env.ADMIN_API_KEY || 'test_admin_api_key_secure_67890',

  SYBILL_API_BASE_URL: process.env.SYBILL_API_BASE_URL || 'https://api.sybill.ai/v1',
  SYBILL_API_KEY: process.env.SYBILL_API_KEY || '',
  SYBILL_IMPORT_ENDPOINT: process.env.SYBILL_IMPORT_ENDPOINT || '/conversations/import',
  SYBILL_CONVERSATIONS_ENDPOINT: process.env.SYBILL_CONVERSATIONS_ENDPOINT || '/conversations',
  SYBILL_REQUEST_TIMEOUT_MS: parseInt(process.env.SYBILL_REQUEST_TIMEOUT_MS, 10) || 15000,
  SYBILL_SOURCE_ID: process.env.SYBILL_SOURCE_ID || '',

  MAX_DELIVERY_ATTEMPTS: parseInt(process.env.MAX_DELIVERY_ATTEMPTS, 10) || 5,
  RETRY_INITIAL_DELAY_MS: parseInt(process.env.RETRY_INITIAL_DELAY_MS, 10) || 2000,
  RETRY_MAX_DELAY_MS: parseInt(process.env.RETRY_MAX_DELAY_MS, 10) || 60000,
  RETRY_BACKOFF_FACTOR: parseFloat(process.env.RETRY_BACKOFF_FACTOR) || 2,
  RETRY_JITTER_RATIO: parseFloat(process.env.RETRY_JITTER_RATIO) || 0.2,

  POC_MODE_ENABLED: process.env.POC_MODE_ENABLED === 'true',
};

export default config;
