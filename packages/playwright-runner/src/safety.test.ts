import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './safety.js';

describe('destination safety', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.1.1',
    '::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('rejects private or local destination %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it('accepts a public address', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
  });
});
