import { describe, expect, it } from 'vitest';
import { runDetailSchema } from './index.js';

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
