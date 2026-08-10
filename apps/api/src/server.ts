import 'dotenv/config';
import { getConfig } from '@opspilot/config';
import { buildApp } from './app.js';

// Telemetry & Server initialization (OTEL_PROMETHEUS_URL)

const dbUrl = process.env.DATABASE_URL;
const isDbUrlPresent = typeof dbUrl === 'string' && dbUrl.trim().length > 0;

console.log('🔍 === OPSPILOT RUNTIME DIAGNOSTIC ===');
console.log(`NODE_ENV: ${process.env.NODE_ENV ?? 'undefined'}`);
console.log(`Working Directory: ${process.cwd()}`);
if (isDbUrlPresent) {
  console.log('DATABASE_URL runtime check: PRESENT');
  console.log(`DATABASE_URL length: ${dbUrl.length}`);
} else {
  console.log('DATABASE_URL runtime check: MISSING');
}
console.log('====================================');

const config = getConfig();

const start = async () => {
  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`🚀 OpsPilot API running on http://0.0.0.0:${config.PORT}`);
    app.log.info(`📖 Swagger docs at http://0.0.0.0:${config.PORT}/documentation`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  process.exit(0);
});

process.on('SIGINT', async () => {
  process.exit(0);
});

void start();
