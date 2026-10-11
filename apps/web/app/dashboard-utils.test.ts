import { describe, expect, it } from 'vitest';
import { comparisonBadgeClass, targetLabel, targetsEmptyCopy } from './dashboard-utils';

describe('dashboard utilities', () => {
  it('provides the target empty-state copy', () => {
    expect(targetsEmptyCopy(0)).toContain('Add your first website');
  });

  it('derives a readable target label from a URL', () => {
    expect(targetLabel('https://app.example.com/path')).toBe('app.example.com');
  });

  it('maps comparison status to appropriate CSS badge class', () => {
    expect(comparisonBadgeClass('RECOVERED')).toBe('comparison-status recovered');
    expect(comparisonBadgeClass('REGRESSED')).toBe('comparison-status regressed');
    expect(comparisonBadgeClass('UNCHANGED')).toBe('comparison-status unchanged');
    expect(comparisonBadgeClass('INCONCLUSIVE')).toBe('comparison-status inconclusive');
    expect(comparisonBadgeClass('NO_PREDECESSOR')).toBe('comparison-status baseline');
  });
});
