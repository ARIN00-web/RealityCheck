import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { RegressionQueue, RunQueue } from '../src/queue.js';
import type { QueuedExecutionResult } from '../src/regressions.js';
import type { RunRepository } from '../src/runs.js';
import type { TargetRepository } from '../src/targets.js';
import type { RegressionExecution } from '@realitycheck/shared';

const targetRepository: TargetRepository = {
  createTarget: async () => ({
    id: 't-1',
    url: 'https://example.test',
    createdAt: new Date(),
    updatedAt: new Date(),
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

const validExecution: RegressionExecution = {
  id: 'exec-1',
  regressionTestId: 'test-1',
  attemptNumber: 1,
  status: 'QUEUED',
  startedAt: null,
  completedAt: null,
  failureReason: null,
  message: 'Regression execution queued',
  assertions: null,
  createdAt: new Date(),
};

function createMockRegressionRepository(overrides: Partial<any> = {}) {
  return {
    listFindings: async () => [],
    generate: async () => null,
    list: async () => [],
    find: async (id: string) =>
      id === 'test-1'
        ? {
            id: 'test-1',
            findingId: 'f-1',
            name: 'Test 1',
            createdAt: new Date(),
            specification: {
              version: 1 as const,
              findingId: 'f-1',
              targetId: 't-1',
              initialUrl: 'https://example.test',
              createdAt: new Date().toISOString(),
              steps: [{ type: 'click' as const, target: 'button', label: 'Submit' }],
              assertion: { kind: 'absence_of_recorded_browser_error' as const },
            },
          }
        : null,
    createQueuedExecution: async (id: string): Promise<QueuedExecutionResult> => {
      if (id === 'missing-test') return { kind: 'not_found' };
      if (id === 'invalid-spec-test')
        return { kind: 'invalid_specification', reason: 'Invalid spec' };
      if (id === 'conflict-test')
        return { kind: 'active_conflict', activeExecutionId: 'active-exec-1' };
      return { kind: 'success', execution: { ...validExecution, regressionTestId: id } };
    },
    failQueueing: async (executionId: string, errorReason?: string) => ({
      ...validExecution,
      id: executionId,
      status: 'ERROR' as const,
      completedAt: new Date(),
      failureReason: errorReason ?? 'Queue unavailable',
      message: 'Failed to enqueue regression execution job',
    }),
    findExecution: async (id: string) => (id === 'exec-1' ? validExecution : null),
    listExecutions: async (testId: string) => (testId === 'test-1' ? [validExecution] : []),
    ...overrides,
  };
}

function createApp(
  regressionRepository = createMockRegressionRepository(),
  regressionQueue?: RegressionQueue,
) {
  return buildApp({
    readinessCheck: async () => ({ database: 'ok', redis: 'ok' }),
    targetRepository,
    runRepository,
    runQueue,
    regressionQueue,
    regressionRepository,
    artifactStoragePath: '/tmp/realitycheck-test-storage',
  });
}

describe('regression execution API endpoints', () => {
  it('successfully creates and enqueues a regression execution attempt', async () => {
    let enqueuedTestId: string | null = null;
    let enqueuedExecId: string | null = null;

    const queue: RegressionQueue = {
      enqueue: async (testId, execId) => {
        enqueuedTestId = testId;
        enqueuedExecId = execId;
      },
    };

    const app = createApp(createMockRegressionRepository(), queue);
    const response = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/test-1/executions',
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      id: 'exec-1',
      regressionTestId: 'test-1',
      attemptNumber: 1,
      status: 'QUEUED',
    });
    expect(enqueuedTestId).toBe('test-1');
    expect(enqueuedExecId).toBe('exec-1');
    await app.close();
  });

  it('supports the /runs route alias', async () => {
    const queue: RegressionQueue = { enqueue: async () => undefined };
    const app = createApp(createMockRegressionRepository(), queue);
    const response = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/test-1/runs',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: 'exec-1', status: 'QUEUED' });
    await app.close();
  });

  it('returns 404 for non-existent regression test', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/missing-test/executions',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'REGRESSION_TEST_NOT_FOUND' },
    });
    await app.close();
  });

  it('returns 422 when persisted regression test specification is invalid', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/invalid-spec-test/executions',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_SPECIFICATION' },
    });
    await app.close();
  });

  it('prevents concurrent executions and returns 409 when an execution is already active', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/conflict-test/executions',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: 'ACTIVE_EXECUTION_EXISTS' },
    });
    await app.close();
  });

  it('fails queueing explicitly and returns 503 when queue dispatch throws', async () => {
    let failedId: string | null = null;
    const repo = createMockRegressionRepository({
      failQueueing: async (execId: string, reason?: string) => {
        failedId = execId;
        return {
          ...validExecution,
          id: execId,
          status: 'ERROR' as const,
          completedAt: new Date(),
          failureReason: reason ?? 'Queue unavailable',
        };
      },
    });

    const failingQueue: RegressionQueue = {
      enqueue: async () => {
        throw new Error('Redis connection timeout');
      },
    };

    const app = createApp(repo, failingQueue);
    const response = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/test-1/executions',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'QUEUE_UNAVAILABLE' },
      execution: {
        status: 'ERROR',
        failureReason: 'Regression test execution could not be queued',
      },
    });
    expect(failedId).toBe('exec-1');
    await app.close();
  });

  it('lists executions for a regression test', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/regression-tests/test-1/executions',
    });

    expect(response.statusCode).toBe(200);
    const list = response.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'exec-1', attemptNumber: 1 });
    await app.close();
  });

  it('finds a single execution by ID or returns 404', async () => {
    const app = createApp();
    const [found, missing] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/regression-executions/exec-1' }),
      app.inject({ method: 'GET', url: '/api/regression-executions/missing-exec' }),
    ]);

    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ id: 'exec-1', status: 'QUEUED' });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      error: { code: 'REGRESSION_EXECUTION_NOT_FOUND' },
    });
    await app.close();
  });
});
