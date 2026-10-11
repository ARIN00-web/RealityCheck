import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { RegressionQueue, RunQueue } from '../src/queue.js';
import { createRegressionRepository } from '../src/regressions.js';
import type { RunRepository } from '../src/runs.js';
import type { TargetRepository } from '../src/targets.js';

describe('End-to-End Regression Journey Integration', () => {
  it('completes the full journey: finding verification, test generation, executions, reruns, comparisons, and conflict safety', async () => {
    // In-memory state tracking for complete lifecycle
    const findingsState = [
      {
        id: 'f-e2e',
        runId: 'r-1',
        title: 'Uncaught page error in customer dashboard',
        status: 'CANDIDATE' as 'CANDIDATE' | 'VERIFIED',
        verifiedAt: null as Date | null,
        description: JSON.stringify({
          category: 'page_error',
          severity: 'high',
          confidence: 'medium',
          affectedUrl: 'http://127.0.0.1:8088/dashboard?secret_token=supersecret123',
          expected: 'Page renders without error',
          actual: 'TypeError: Cannot read properties of undefined',
          summary: 'A JavaScript runtime crash occurred',
        }),
        run: {
          targetId: 't-1',
          target: { url: 'http://127.0.0.1:8088' },
          journeys: [
            {
              actions: [
                {
                  id: 'act-1',
                  position: 0,
                  type: 'click',
                  target: 'button#load-data',
                  status: 'SUCCEEDED',
                  detail: { label: 'Load Data' },
                },
              ],
            },
          ],
        },
        journey: {
          actions: [
            {
              id: 'act-1',
              position: 0,
              type: 'click',
              target: 'button#load-data',
              status: 'SUCCEEDED',
              detail: { label: 'Load Data' },
            },
          ],
        },
      },
    ];

    let regressionTestsState: any[] = [];
    let executionsState: any[] = [];
    const enqueuedJobs: any[] = [];

    const mockPrisma = {
      finding: {
        findMany: async ({ where }: any) => {
          return findingsState.filter((f) => f.run.targetId === where.run.targetId);
        },
        findUnique: async ({ where }: any) => {
          return findingsState.find((f) => f.id === where.id) ?? null;
        },
        update: async ({ where, data }: any) => {
          const item = findingsState.find((f) => f.id === where.id);
          if (item) {
            Object.assign(item, data);
            return { ...item };
          }
          throw new Error('Finding not found');
        },
      },
      regressionTest: {
        findMany: async ({ where }: any) => {
          return regressionTestsState.filter(
            (t) => t.specification.targetId === (where.finding?.run?.targetId ?? 't-1'),
          );
        },
        findUnique: async ({ where }: any) => {
          return regressionTestsState.find((t) => t.id === where.id) ?? null;
        },
        upsert: async ({ create }: any) => {
          const test = {
            id: 'rt-e2e',
            findingId: create.findingId,
            name: create.name,
            specification: create.specification,
            specificationVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          regressionTestsState.push(test);
          return test;
        },
      },
      regressionExecution: {
        findFirst: async ({ where, orderBy }: any) => {
          if (Array.isArray(where.status?.in)) {
            return (
              executionsState.find(
                (e) =>
                  e.regressionTestId === where.regressionTestId &&
                  where.status.in.includes(e.status),
              ) ?? null
            );
          }
          if (orderBy?.attemptNumber === 'desc') {
            const sorted = [...executionsState]
              .filter((e) => e.regressionTestId === where.regressionTestId)
              .sort((a, b) => b.attemptNumber - a.attemptNumber);
            return sorted[0] ?? null;
          }
          return null;
        },
        findMany: async ({ where }: any) => {
          return executionsState
            .filter((e) => e.regressionTestId === where.regressionTestId)
            .sort((a, b) => b.attemptNumber - a.attemptNumber);
        },
        findUnique: async ({ where }: any) => {
          return executionsState.find((e) => e.id === where.id) ?? null;
        },
        create: async ({ data }: any) => {
          const exec = {
            id: `exec-${executionsState.length + 1}`,
            regressionTestId: data.regressionTestId,
            attemptNumber: data.attemptNumber,
            status: data.status,
            startedAt: null,
            completedAt: null,
            failureReason: null,
            message: data.message ?? 'Regression execution queued',
            assertions: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          executionsState.push(exec);
          return exec;
        },
      },
      $transaction: async (fn: any) => fn(mockPrisma),
    };

    const targetRepository: TargetRepository = {
      createTarget: async () => ({
        id: 't-1',
        url: 'http://127.0.0.1:8088',
        createdAt: new Date(),
        updatedAt: new Date(),
        runCount: 1,
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
    const regressionQueue: RegressionQueue = {
      enqueue: async (testId, execId) => {
        enqueuedJobs.push({ testId, execId });
      },
    };

    const app = buildApp({
      readinessCheck: async () => ({ database: 'ok', redis: 'ok' }),
      targetRepository,
      runRepository,
      runQueue,
      regressionQueue,
      artifactStoragePath: './storage',
      prisma: mockPrisma as any,
    });

    // Step 1: Query findings for target before verification -> ineligible because CANDIDATE
    const initialFindingsRes = await app.inject({
      method: 'GET',
      url: '/api/targets/t-1/regression-findings',
    });
    expect(initialFindingsRes.statusCode).toBe(200);
    const initialFindings = initialFindingsRes.json();
    expect(initialFindings[0]).toMatchObject({
      findingId: 'f-e2e',
      eligible: false,
      reason: 'Only independently verified findings can become regression tests.',
    });

    // Step 2: Attempt to generate regression test before verification -> rejected with 422
    const prematureGen = await app.inject({
      method: 'POST',
      url: '/api/findings/f-e2e/regression-test',
    });
    expect(prematureGen.statusCode).toBe(422);
    expect(prematureGen.json()).toMatchObject({
      error: { code: 'FINDING_INELIGIBLE' },
    });

    // Step 3: Verify finding via POST /api/findings/:id/verify
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/findings/f-e2e/verify',
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json()).toMatchObject({
      id: 'f-e2e',
      status: 'VERIFIED',
    });

    // Step 4: Finding is now eligible
    const eligibleFindingsRes = await app.inject({
      method: 'GET',
      url: '/api/targets/t-1/regression-findings',
    });
    expect(eligibleFindingsRes.statusCode).toBe(200);
    expect(eligibleFindingsRes.json()[0]).toMatchObject({
      findingId: 'f-e2e',
      eligible: true,
      reason: null,
    });

    // Step 5: Generate regression test specification from verified finding
    const genRes = await app.inject({
      method: 'POST',
      url: '/api/findings/f-e2e/regression-test',
    });
    expect(genRes.statusCode).toBe(201);
    const generatedTest = genRes.json();
    expect(generatedTest).toMatchObject({
      id: 'rt-e2e',
      name: expect.stringContaining('Uncaught page error'),
      specification: {
        version: 1,
        initialUrl: 'http://127.0.0.1:8088/',
        assertion: { kind: 'absence_of_recorded_browser_error' },
        steps: [{ type: 'click', target: 'button#load-data', label: 'Load Data' }],
      },
    });

    // Step 6: Queue Attempt #1
    const exec1Res = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/rt-e2e/executions',
    });
    expect(exec1Res.statusCode).toBe(201);
    const exec1 = exec1Res.json();
    expect(exec1).toMatchObject({
      attemptNumber: 1,
      status: 'QUEUED',
    });
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]).toEqual({ testId: 'rt-e2e', execId: exec1.id });

    // Step 7: Attempt concurrent duplicate run while Attempt #1 is active -> 409 Conflict
    const conflictRes = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/rt-e2e/executions',
    });
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.json()).toMatchObject({
      error: { code: 'ACTIVE_EXECUTION_EXISTS' },
    });

    // Step 8: Simulate worker completion of Attempt #1 (FAILED with page error)
    executionsState[0].status = 'FAILED';
    executionsState[0].completedAt = new Date();
    executionsState[0].failureReason = 'Sanitized: Uncaught error in script';
    executionsState[0].assertions = [
      {
        kind: 'absence_of_recorded_browser_error',
        passed: false,
        message: 'Uncaught page error detected',
      },
    ];

    // Step 9: Query comparison after Attempt #1 -> Baseline
    const comp1Res = await app.inject({
      method: 'GET',
      url: '/api/regression-tests/rt-e2e/comparison',
    });
    expect(comp1Res.statusCode).toBe(200);
    expect(comp1Res.json()).toMatchObject({
      status: 'NO_PREDECESSOR',
      currentAttemptNumber: 1,
      currentStatus: 'FAILED',
    });

    // Step 10: Rerun the stored specification (Attempt #2)
    const exec2Res = await app.inject({
      method: 'POST',
      url: '/api/regression-tests/rt-e2e/executions',
    });
    expect(exec2Res.statusCode).toBe(201);
    const exec2 = exec2Res.json();
    expect(exec2).toMatchObject({
      attemptNumber: 2,
      status: 'QUEUED',
    });

    // Step 11: Inconclusive comparison while Attempt #2 is RUNNING/QUEUED
    const compInconclusiveRes = await app.inject({
      method: 'GET',
      url: '/api/regression-tests/rt-e2e/comparison',
    });
    expect(compInconclusiveRes.statusCode).toBe(200);
    expect(compInconclusiveRes.json()).toMatchObject({
      status: 'INCONCLUSIVE',
      currentAttemptNumber: 2,
      previousAttemptNumber: 1,
    });

    // Step 12: Simulate worker completion of Attempt #2 (PASSED - bug fixed)
    executionsState[1].status = 'PASSED';
    executionsState[1].completedAt = new Date();
    executionsState[1].failureReason = null;
    executionsState[1].assertions = [
      {
        kind: 'absence_of_recorded_browser_error',
        passed: true,
      },
    ];

    // Step 13: Query comparison after Attempt #2 -> RECOVERED ($N$ vs $N-1$)
    const comp2Res = await app.inject({
      method: 'GET',
      url: '/api/regression-tests/rt-e2e/comparison',
    });
    expect(comp2Res.statusCode).toBe(200);
    expect(comp2Res.json()).toMatchObject({
      status: 'RECOVERED',
      currentAttemptNumber: 2,
      previousAttemptNumber: 1,
      currentStatus: 'PASSED',
      previousStatus: 'FAILED',
      assertions: [
        {
          kind: 'absence_of_recorded_browser_error',
          status: 'RECOVERED',
        },
      ],
    });

    // Step 14: Execution history lists attempts in reverse chronological order
    const historyRes = await app.inject({
      method: 'GET',
      url: '/api/regression-tests/rt-e2e/executions',
    });
    expect(historyRes.statusCode).toBe(200);
    const history = historyRes.json();
    expect(history).toHaveLength(2);
    expect(history[0].attemptNumber).toBe(2);
    expect(history[0].status).toBe('PASSED');
    expect(history[1].attemptNumber).toBe(1);
    expect(history[1].status).toBe('FAILED');
    expect(history[1].failureReason).toBe('Sanitized: Uncaught error in script');

    await app.close();
  });
});
