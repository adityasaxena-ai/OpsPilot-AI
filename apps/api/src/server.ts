import 'dotenv/config';
import { getConfig } from '@opspilot/config';
import { buildApp } from './app.js';

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
