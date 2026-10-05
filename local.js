import app from './src/app.js';
import config from './src/config/env.js';
import { connectDB } from './src/config/db.js';

async function startServer() {
  try {
    await connectDB();
    console.log(`Connected to MongoDB at ${config.DB_MONGODB_URI}`);

    const server = app.listen(config.PORT, () => {
      console.log(`=================================================`);
      console.log(`  PLAUD-to-Sybill Integration Server Running    `);
      console.log(`  Port: http://localhost:${config.PORT}         `);
      console.log(`  Health: http://localhost:${config.PORT}/api/v1/health`);
      console.log(`  Environment: ${config.NODE_ENV}              `);
      console.log(`=================================================`);
    });

    const shutdown = async () => {
      console.log('\nGracefully shutting down...');
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
