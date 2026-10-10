import { describe, expect, it } from 'vitest';
import {
  assessRegressionEligibility,
  createRegressionSpecification,
  NotImplementedRegressionRunner,
  sanitizeFailureReason,
} from './index.js';

const finding = {
  id: 'finding-1',
  status: 'VERIFIED' as const,
  verifiedAt: new Date(),
  title: 'Page error',
  description: JSON.stringify({ category: 'page_error' }),
};
const actions = [
  {
    id: 'a-1',
    position: 0,
    type: 'click',
    target: 'button',
    status: 'SUCCEEDED' as const,
    detail: { label: 'Show details' },
  },
];

describe('regression eligibility', () => {
  it('rejects candidates and generates a deterministic verified specification', () => {
    expect(
      assessRegressionEligibility({ ...finding, status: 'CANDIDATE', verifiedAt: null }, actions),
    ).toMatchObject({ eligible: false });
    const specification = createRegressionSpecification({
      finding,
      targetId: 'target-1',
      targetUrl: 'https://example.test/path?token=secret',
      actions,
      now: new Date('2026-01-01'),
    });
    expect(specification).toMatchObject({
      initialUrl: 'https://example.test/path',
      steps: [{ type: 'click', target: 'button' }],
    });
  });

  it('rejects unsafe recorded controls', () => {
    expect(
      assessRegressionEligibility(finding, [
        { ...actions[0], detail: { label: 'Delete account' } },
      ]),
    ).toMatchObject({ eligible: false });
  });
});

describe('NotImplementedRegressionRunner', () => {
  it('explicitly throws that regression replay is not implemented (Phase 2)', async () => {
    const runner = new NotImplementedRegressionRunner();
    const specification = createRegressionSpecification({
      finding,
      targetId: 'target-1',
      targetUrl: 'https://example.test/path',
      actions,
    });
    await expect(runner.replay(specification)).rejects.toThrow(
      'Regression replay is not yet implemented (Phase 2)',
    );
  });
});

describe('sanitizeFailureReason', () => {
  it('redacts sensitive credentials and query parameters', () => {
    const raw =
      'Authorization: Bearer secret-token-123 failed for https://example.test/api?token=supersecret&key=12345';
    const sanitized = sanitizeFailureReason(raw);
    expect(sanitized).not.toContain('secret-token-123');
    expect(sanitized).not.toContain('supersecret');
    expect(sanitized).not.toContain('12345');
    expect(sanitized).toContain('Authorization=[redacted]');
    expect(sanitized).toContain('token=[redacted]');
  });

  it('bounds long failure strings', () => {
    const longMessage = 'A'.repeat(600);
    const sanitized = sanitizeFailureReason(longMessage, 100);
    expect(sanitized.length).toBe(100);
    expect(sanitized.endsWith('…')).toBe(true);
  });

  it('handles empty or error inputs', () => {
    expect(sanitizeFailureReason(null)).toBe('Unknown error');
    expect(sanitizeFailureReason(new Error('Browser crashed'))).toBe('Browser crashed');
  });
});
