import { PrismaClient } from '@prisma/client';
import { getConfig } from '@opspilot/config';

const config = getConfig();

export const db = new PrismaClient({
  log:
    config.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
});
