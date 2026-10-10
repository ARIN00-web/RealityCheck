import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const optionalNonBlankString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const environmentSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis URL'),
  ARTIFACT_STORAGE_PATH: z.string().min(1, 'ARTIFACT_STORAGE_PATH is required'),
  GEMINI_API_KEY: optionalNonBlankString,
  GEMINI_MODEL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).default(DEFAULT_GEMINI_MODEL),
  ),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  RUN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  NAVIGATION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(15_000),
  OBSERVATION_LIMIT: z.coerce.number().int().min(1).max(100).default(50),
  ARTIFACT_MAX_BYTES: z.coerce.number().int().min(1_024).max(10_000_000).default(5_000_000),
  EXPLORATION_ACTION_LIMIT: z.coerce.number().int().min(1).max(20).default(8),
  EXPLORATION_LLM_CALL_LIMIT: z.coerce.number().int().min(0).max(5).default(2),
  EXPLORATION_LLM_TIMEOUT_MS: z.coerce.number().int().min(500).max(15_000).default(5_000),
});

export type AppEnvironment = z.infer<typeof environmentSchema> & {
  artifactStoragePath: string;
};

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }

  const artifactStoragePath = resolveWorkspacePath(parsed.data.ARTIFACT_STORAGE_PATH);
  if (artifactStoragePath === path.parse(artifactStoragePath).root) {
    throw new Error('ARTIFACT_STORAGE_PATH must not resolve to a filesystem root');
  }

  return {
    ...parsed.data,
    artifactStoragePath,
  };
}

function resolveWorkspacePath(value: string): string {
  if (path.isAbsolute(value)) return path.resolve(value);
  let directory = path.resolve(process.cwd());
  while (directory !== path.parse(directory).root) {
    if (fs.existsSync(path.join(directory, 'pnpm-workspace.yaml'))) {
      return path.resolve(directory, value);
    }
    directory = path.dirname(directory);
  }
  return path.resolve(value);
}

export function ensureLocalStorageDirectory(environment: AppEnvironment): string {
  fs.mkdirSync(environment.artifactStoragePath, { recursive: true });
  return environment.artifactStoragePath;
}
