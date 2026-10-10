import { describe, expect, it } from 'vitest';
import { projectActionForRunDetail } from '../src/runs.js';

describe('projectActionForRunDetail', () => {
  it('returns bounded, sanitized action details without raw Playwright errors', () => {
    const action = projectActionForRunDetail({
      id: 'action-1',
      position: 0,
      type: 'navigate',
      target: 'https://user:password@example.test/path?token=secret#fragment',
      status: 'FAILED',
      detail: {
        label: 'Authorization: Bearer secret',
        beforeUrl: 'https://user:password@example.test/before?token=secret#fragment',
        afterUrl: 'https://example.test/after?cookie=value#fragment',
        error: 'page.goto failed for https://user:password@example.test/?token=secret',
      },
      createdAt: new Date('2026-10-11T00:00:00.000Z'),
    });

    expect(action).toMatchObject({
      target: 'https://example.test/path',
      detail: {
        label: 'Authorization=[redacted]',
        beforeUrl: 'https://example.test/before',
        afterUrl: 'https://example.test/after',
        reason: 'Action execution failed',
      },
    });
    expect(JSON.stringify(action)).not.toContain('password');
    expect(JSON.stringify(action)).not.toContain('token=secret');
  });

  it('keeps known, safe skip reasons', () => {
    const action = projectActionForRunDetail({
      id: 'action-2',
      position: 1,
      type: 'click',
      target: 'button',
      status: 'SKIPPED',
      detail: { label: 'Show details', error: 'Action was rejected by the browser safety policy' },
      createdAt: new Date('2026-10-11T00:00:00.000Z'),
    });

    expect(action.detail.reason).toBe('Action was rejected by the browser safety policy');
    expect(action.target).toBe('button');
  });
});
