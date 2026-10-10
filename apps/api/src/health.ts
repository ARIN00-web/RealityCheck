import type { PrismaClient } from '@realitycheck/db';
import type { Redis } from 'ioredis';

export type ReadinessCheck = () => Promise<Record<'database' | 'redis', 'ok' | 'unavailable'>>;

export function createReadinessCheck(prisma: PrismaClient, redis: Redis): ReadinessCheck {
  return async () => {
    const [database, redisCheck] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);

    return {
      database: database.status === 'fulfilled' ? 'ok' : 'unavailable',
      redis:
        redisCheck.status === 'fulfilled' && redisCheck.value === 'PONG' ? 'ok' : 'unavailable',
    };
  };
}
