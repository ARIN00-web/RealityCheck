import Fastify from 'fastify';
import type { ReadinessCheck } from './health.js';
import { registerTargetRoutes } from './routes/targets.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerRegressionRoutes } from './routes/regressions.js';
import { createRegressionRepository } from './regressions.js';
import type { RegressionQueue, RunQueue } from './queue.js';
import type { RunRepository } from './runs.js';
import type { TargetRepository } from './targets.js';

export type AppDependencies = {
  readinessCheck: ReadinessCheck;
  targetRepository: TargetRepository;
  runRepository: RunRepository;
  runQueue: RunQueue;
  regressionQueue?: RegressionQueue;
  artifactStoragePath: string;
  prisma?: import('@realitycheck/db').PrismaClient;
  regressionRepository?: ReturnType<typeof createRegressionRepository>;
};

export function buildApp({
  readinessCheck,
  targetRepository,
  runRepository,
  runQueue,
  regressionQueue,
  artifactStoragePath,
  prisma,
  regressionRepository,
}: AppDependencies) {
  const app = Fastify({ logger: true });

  app.get('/health/live', async () => ({
    status: 'ok' as const,
    service: 'api',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/ready', async (_request, reply) => {
    const checks = await readinessCheck();
    const ready = Object.values(checks).every((status) => status === 'ok');

    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ok' : 'unavailable',
      service: 'api',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  registerTargetRoutes(app, targetRepository);
  registerRunRoutes(app, runRepository, runQueue, artifactStoragePath);

  const regressions =
    regressionRepository ?? (prisma ? createRegressionRepository(prisma) : undefined);
  if (regressions) {
    registerRegressionRoutes(app, regressions, regressionQueue);
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ errorType: error.name }, 'API request failed');
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed' },
    });
  });

  return app;
}
