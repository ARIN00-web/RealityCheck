import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { RunQueue } from '../src/queue.js';
import type { RunRepository } from '../src/runs.js';
import type { TargetRepository } from '../src/targets.js';

const targetRepository: TargetRepository = {
  createTarget: async ({ url }) => ({
    id: 'target-1',
    url,
    createdAt: new Date('2026-10-10T00:00:00.000Z'),
    updatedAt: new Date('2026-10-10T00:00:00.000Z'),
    runCount: 0,
  }),
  listTargets: async () => [],
  findTarget: async () => null,
  listRuns: async () => [],
};

const runRepository: RunRepository = {
  createQueuedRun: async () => null,
  failQueueing: async () => {
    throw new Error('Not used');
  },
  findRun: async () => null,
  findArtifact: async () => null,
};

const runQueue: RunQueue = { enqueue: async () => undefined };

function createApp(
  repository: TargetRepository = targetRepository,
  runs: RunRepository = runRepository,
  queue: RunQueue = runQueue,
) {
  return buildApp({
    readinessCheck: async () => ({ database: 'unavailable', redis: 'unavailable' }),
    targetRepository: repository,
    runRepository: runs,
    runQueue: queue,
    artifactStoragePath: '/tmp/realitycheck-test-storage',
  });
}

describe('health endpoints', () => {
  it('reports liveness without infrastructure', async () => {
    const app = createApp();
    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'api' });
    await app.close();
  });

  it('reports a readiness failure accurately', async () => {
    const app = buildApp({
      readinessCheck: async () => ({ database: 'ok', redis: 'unavailable' }),
      targetRepository,
      runRepository,
      runQueue,
      artifactStoragePath: '/tmp/realitycheck-test-storage',
    });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'unavailable',
      checks: { database: 'ok', redis: 'unavailable' },
    });
    await app.close();
  });
});

describe('target routes', () => {
  it('creates a normalized HTTP target', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/target',
      payload: { url: 'https://Example.com/projects#overview' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'target-1',
      url: 'https://example.com/projects',
      runCount: 0,
    });
    await app.close();
  });

  it.each(['not a url', 'ftp://example.com'])('rejects an invalid target URL: %s', async (url) => {
    const app = createApp();
    const response = await app.inject({ method: 'POST', url: '/api/target', payload: { url } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    await app.close();
  });

  it('rejects arbitrary target fields', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/target',
      payload: { url: 'https://example.com', createdAt: '2020-01-01' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    await app.close();
  });

  it('lists persisted targets and runs', async () => {
    const repository: TargetRepository = {
      ...targetRepository,
      listTargets: async () => [
        {
          id: 'target-2',
          url: 'https://example.com/',
          createdAt: new Date('2026-10-10T00:00:00.000Z'),
          updatedAt: new Date('2026-10-11T00:00:00.000Z'),
          runCount: 1,
        },
      ],
      listRuns: async () => [
        {
          id: 'run-1',
          status: 'SUCCEEDED',
          createdAt: new Date('2026-10-11T00:00:00.000Z'),
          updatedAt: new Date('2026-10-11T00:00:00.000Z'),
          startedAt: new Date('2026-10-11T00:00:00.000Z'),
          completedAt: new Date('2026-10-11T00:01:00.000Z'),
          target: { id: 'target-2', url: 'https://example.com/' },
        },
      ],
    };
    const app = createApp(repository);

    const [targets, runs] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/targets' }),
      app.inject({ method: 'GET', url: '/api/runs' }),
    ]);

    expect(targets.statusCode).toBe(200);
    expect(targets.json()).toHaveLength(1);
    expect(runs.statusCode).toBe(200);
    expect(runs.json()).toMatchObject([{ id: 'run-1', target: { id: 'target-2' } }]);
    await app.close();
  });

  it('returns 404 for an unknown target', async () => {
    const app = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/targets/missing-target' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'TARGET_NOT_FOUND' } });
    await app.close();
  });

  it('queues a persisted run for a known target', async () => {
    const queuedRun = {
      id: 'run-queued',
      status: 'QUEUED' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      completedAt: null,
      target: { id: 'target-1', url: 'https://example.com/' },
    };
    const enqueue = async (id: string) => {
      expect(id).toBe('run-queued');
    };
    const app = createApp(
      targetRepository,
      { ...runRepository, createQueuedRun: async () => queuedRun },
      { enqueue },
    );
    const response = await app.inject({ method: 'POST', url: '/api/targets/target-1/runs' });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: 'run-queued', status: 'QUEUED' });
    await app.close();
  });

  it('does not leave a queued run when queue dispatch fails', async () => {
    const failedRun = {
      id: 'run-failed',
      status: 'FAILED' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      completedAt: new Date(),
      target: { id: 'target-1', url: 'https://example.com/' },
    };
    const app = createApp(
      targetRepository,
      {
        ...runRepository,
        createQueuedRun: async () => ({
          ...failedRun,
          status: 'QUEUED' as const,
          completedAt: null,
        }),
        failQueueing: async () => failedRun,
      },
      {
        enqueue: async () => {
          throw new Error('Redis unavailable');
        },
      },
    );
    const response = await app.inject({ method: 'POST', url: '/api/targets/target-1/runs' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'QUEUE_UNAVAILABLE' },
      run: { status: 'FAILED' },
    });
    await app.close();
  });
});
