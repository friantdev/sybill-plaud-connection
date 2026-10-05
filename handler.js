import serverless from 'serverless-http';
import app from './src/app.js';

// Wrap express app with serverless-http for API Gateway / Lambda
const apiHandler = serverless(app);

export const api = async (event, context) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }
  return apiHandler(event, context);
};

export default {
  api,
};
