import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeDestinationError';
  }
}

export async function assertSafeHttpUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeDestinationError('Browser destination must be a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeDestinationError('Browser destination must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new UnsafeDestinationError('Browser destination must not contain credentials');
  }
  if (
    url.hostname.toLowerCase() === 'localhost' ||
    url.hostname.toLowerCase().endsWith('.localhost')
  ) {
    throw new UnsafeDestinationError('Localhost destinations are not allowed');
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new UnsafeDestinationError('Browser destination does not resolve to a public address');
  }
  return url;
}

export function isPublicAddress(address: string): boolean {
  const lowered = address.toLowerCase();
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lowered);
  const normalized = mapped
    ? `${(Number.parseInt(mapped[1], 16) >> 8) & 255}.${Number.parseInt(mapped[1], 16) & 255}.${(Number.parseInt(mapped[2], 16) >> 8) & 255}.${Number.parseInt(mapped[2], 16) & 255}`
    : lowered.replace(/^::ffff:/, '');
  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split('.').map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19))
    );
  }
  if (isIP(normalized) === 6) {
    return !(
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }
  return false;
}
