import { describe, expect, it } from 'vitest';
import { regressionTestSchema, runDetailSchema } from './index.js';

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
