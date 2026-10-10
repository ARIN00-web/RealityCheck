import 'dotenv/config';
import { loadEnvironment } from '@realitycheck/config';
import { createPrismaClient } from '@realitycheck/db';
import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { createReadinessCheck } from './health.js';
import { createRunQueue } from './queue.js';
import { createRunRepository } from './runs.js';
import { createTargetRepository } from './targets.js';
import { startupErrorDetails } from './startup-error.js';

const environment = loadEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const redis = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: 1 });
const app = buildApp({
  readinessCheck: createReadinessCheck(prisma, redis),
  targetRepository: createTargetRepository(prisma),
  runRepository: createRunRepository(prisma),
  runQueue: createRunQueue(redis),
  artifactStoragePath: environment.artifactStoragePath,
});

async function close(): Promise<void> {
  await app.close();
  await Promise.all([prisma.$disconnect(), redis.quit()]);
}

process.once('SIGINT', () => void close().finally(() => process.exit(0)));
process.once('SIGTERM', () => void close().finally(() => process.exit(0)));

try {
  await app.listen({ port: environment.API_PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error({ startupError: startupErrorDetails(error) }, 'API failed to start');
  await close();
  process.exit(1);
}
