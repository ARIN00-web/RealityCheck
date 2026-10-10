import { describe, expect, it } from 'vitest';
import { assessRegressionEligibility, createRegressionSpecification } from './index.js';

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
