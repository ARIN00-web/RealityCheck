import { describe, expect, it } from 'vitest';
import { startupErrorDetails } from '../src/startup-error.js';

describe('startupErrorDetails', () => {
  it('keeps startup diagnostics while redacting connection credentials', () => {
    const error = Object.assign(
      new Error('listen EADDRINUSE; postgresql://user:password@localhost:5432/realitycheck'),
      { code: 'EADDRINUSE' },
    );

    expect(startupErrorDetails(error)).toMatchObject({
      errorType: 'Error',
      errorCode: 'EADDRINUSE',
      message: expect.stringContaining('[REDACTED]@'),
    });
    expect(startupErrorDetails(error).message).not.toContain('password');
  });
});
