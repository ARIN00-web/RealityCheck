import { describe, expect, it } from 'vitest';
import {
  regressionExecutionSchema,
  regressionJobDataSchema,
  regressionTestSchema,
  runDetailSchema,
} from './index.js';

describe('runDetailSchema', () => {
  it('accepts ordered journey action details', () => {
    const result = runDetailSchema.safeParse({
      id: 'run-1',
      status: 'SUCCEEDED',
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
      target: { id: 'target-1', url: 'https://example.test/' },
      error: null,
      events: [],
      artifacts: [],
      findings: [],
      journeys: [
        {
          id: 'journey-1',
          name: 'Browser exploration',
          position: 0,
          status: 'COMPLETED',
          actions: [
            {
              id: 'action-1',
              position: 0,
              type: 'navigate',
              target: 'https://example.test/path',
              status: 'SUCCEEDED',
              detail: {
                label: 'Catalog',
                beforeUrl: 'https://example.test/',
                afterUrl: 'https://example.test/path',
                reason: null,
              },
              createdAt: new Date(),
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe('regressionTestSchema', () => {
  it('accepts the bounded deterministic specification returned by the API', () => {
    expect(
      regressionTestSchema.safeParse({
        id: 'test-1',
        findingId: 'finding-1',
        name: 'Uncaught page error',
        createdAt: new Date(),
        specification: {
          version: 1,
          findingId: 'finding-1',
          targetId: 'target-1',
          initialUrl: 'https://example.test/path',
          createdAt: new Date().toISOString(),
          steps: [{ type: 'click', target: 'button', label: 'Show details' }],
          assertion: { kind: 'absence_of_recorded_browser_error' },
        },
      }).success,
    ).toBe(true);
  });
});

describe('regressionJobDataSchema', () => {
  it('validates required regression test and execution IDs', () => {
    expect(
      regressionJobDataSchema.safeParse({
        regressionTestId: 'test-1',
        executionId: 'exec-1',
      }).success,
    ).toBe(true);

    expect(regressionJobDataSchema.safeParse({}).success).toBe(false);
    expect(regressionJobDataSchema.safeParse({ regressionTestId: '' }).success).toBe(false);
    expect(
      regressionJobDataSchema.safeParse({ regressionTestId: 'test-1', executionId: '' }).success,
    ).toBe(false);
  });
});

describe('regressionExecutionSchema', () => {
  it('accepts valid execution attempts across all lifecycle statuses', () => {
    const statuses = ['QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR'] as const;
    for (const status of statuses) {
      const parsed = regressionExecutionSchema.safeParse({
        id: 'exec-1',
        regressionTestId: 'test-1',
        attemptNumber: 1,
        status,
        startedAt: status === 'QUEUED' ? null : new Date(),
        completedAt: ['PASSED', 'FAILED', 'ERROR'].includes(status) ? new Date() : null,
        failureReason: status === 'FAILED' ? 'Assertion failed' : null,
        assertions:
          status === 'PASSED'
            ? [{ kind: 'absence_of_recorded_browser_error', passed: true }]
            : null,
        createdAt: new Date(),
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects invalid attempt numbers and unknown statuses', () => {
    expect(
      regressionExecutionSchema.safeParse({
        id: 'exec-1',
        regressionTestId: 'test-1',
        attemptNumber: 0,
        status: 'QUEUED',
        startedAt: null,
        completedAt: null,
        failureReason: null,
        createdAt: new Date(),
      }).success,
    ).toBe(false);

    expect(
      regressionExecutionSchema.safeParse({
        id: 'exec-1',
        regressionTestId: 'test-1',
        attemptNumber: 1,
        status: 'UNKNOWN_STATUS',
        startedAt: null,
        completedAt: null,
        failureReason: null,
        createdAt: new Date(),
      }).success,
    ).toBe(false);
  });
});
