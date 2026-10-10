import { describe, expect, it } from 'vitest';
import { targetLabel, targetsEmptyCopy } from './dashboard-utils';

describe('dashboard utilities', () => {
  it('provides the target empty-state copy', () => {
    expect(targetsEmptyCopy(0)).toContain('Add your first website');
  });

  it('derives a readable target label from a URL', () => {
    expect(targetLabel('https://app.example.com/path')).toBe('app.example.com');
  });
});
