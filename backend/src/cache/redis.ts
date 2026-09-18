import Redis from 'ioredis';
import { getConfig } from '../config';
import { logger } from '../logger';

let client: Redis | undefined;
let warned = false;

export function getRedis(): Redis | undefined {
  if (client) return client;
  const { REDIS_URL } = getConfig();
  if (!REDIS_URL) {
    if (!warned) {
      warned = true;
      logger.warn('REDIS_URL not configured — Redis features disabled');
    }
    return undefined;
  }
  client = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, enableReadyCheck: true });
  client.on('error', (err) => logger.warn({ err }, 'redis error'));
  return client;
}

export function resetRedis(): void {
  if (client) {
    client.disconnect();
    client = undefined;
  }
  warned = false;
}
