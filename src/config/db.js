import mongoose from 'mongoose';
import config from './env.js';

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Connect to MongoDB with caching for serverless warm starts
 */
export async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise || mongoose.connection.readyState === 0) {
    const opts = {
      serverSelectionTimeoutMS: 10000,
    };

    const mongoUri = config.DB_MONGODB_URI;

    cached.promise = mongoose.connect(mongoUri, opts).then((m) => {
      console.log(`MongoDB connected successfully to DB: "${mongoose.connection.name}" on host: "${mongoose.connection.host}"`);
      return m;
    }).catch((err) => {
      cached.promise = null;
      console.error('MongoDB connection error:', err.message);
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

/**
 * Disconnect from MongoDB (useful for clean test teardowns)
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}

export default {
  connectDB,
  disconnectDB,
};
