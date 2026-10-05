import config from '../config/env.js';

/**
 * Centralized error handler
 */
export function errorHandler(err, req, res, next) {
  console.error('Unhandled application error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const response = {
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  };

  if (config.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

export default {
  errorHandler,
};
