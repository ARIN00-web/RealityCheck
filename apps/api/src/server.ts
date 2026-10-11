import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { loadEnvironment } from '@realitycheck/config';
import { createPrismaClient } from '@realitycheck/db';
import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { createReadinessCheck } from './health.js';
import { createRegressionQueue, createRunQueue } from './queue.js';
import { createRunRepository } from './runs.js';
import { createTargetRepository } from './targets.js';
import { startupErrorDetails } from './startup-error.js';

if (!process.env.DATABASE_URL) {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      if (process.env.DATABASE_URL) break;
    }
    dir = path.dirname(dir);
  }
}

const environment = loadEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const redis = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: 1 });
const app = buildApp({
  readinessCheck: createReadinessCheck(prisma, redis),
  targetRepository: createTargetRepository(prisma),
  runRepository: createRunRepository(prisma),
  runQueue: createRunQueue(redis),
  regressionQueue: createRegressionQueue(redis),
  artifactStoragePath: environment.artifactStoragePath,
  prisma,
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
