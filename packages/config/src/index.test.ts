import { describe, expect, it } from 'vitest';
import { DEFAULT_GEMINI_MODEL, loadEnvironment } from './index.js';

describe('loadEnvironment', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/realitycheck',
    REDIS_URL: 'redis://localhost:6379',
    ARTIFACT_STORAGE_PATH: './storage',
  };

  it('loads deterministic mode when Gemini variables are missing', () => {
    const environment = loadEnvironment(base);
    expect(environment.GEMINI_API_KEY).toBeUndefined();
    expect(environment.GEMINI_MODEL).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('treats empty Gemini variables as absent', () => {
    const environment = loadEnvironment({ ...base, GEMINI_API_KEY: '', GEMINI_MODEL: '' });
    expect(environment.GEMINI_API_KEY).toBeUndefined();
    expect(environment.GEMINI_MODEL).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('treats whitespace-only Gemini variables as absent', () => {
    const environment = loadEnvironment({ ...base, GEMINI_API_KEY: '   ', GEMINI_MODEL: '\t' });
    expect(environment.GEMINI_API_KEY).toBeUndefined();
    expect(environment.GEMINI_MODEL).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('retains valid configured Gemini values', () => {
    const environment = loadEnvironment({
      ...base,
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_MODEL: 'gemini-test',
    });
    expect(environment.GEMINI_API_KEY).toBe('test-gemini-key');
    expect(environment.GEMINI_MODEL).toBe('gemini-test');
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'ARTIFACT_STORAGE_PATH'] as const)(
    'rejects missing required infrastructure variable %s',
    (key) => {
      expect(() => loadEnvironment({ ...base, [key]: undefined })).toThrow(
        'Invalid environment configuration',
      );
    },
  );

  it('resolves relative artifact storage from the workspace root', () => {
    expect(loadEnvironment(base).artifactStoragePath).toMatch(/RealityCheck\/storage$/);
  });
});
