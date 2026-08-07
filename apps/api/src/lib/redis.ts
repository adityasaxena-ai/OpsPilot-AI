import { Redis } from 'ioredis';
import { getConfig } from '@opspilot/config';

const config = getConfig();

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  enableReadyCheck: true,
});

redis.on('error', (err: unknown) => {
  console.error('[Redis] Connection error:', err);
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});
