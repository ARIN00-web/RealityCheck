import type { PrismaClient } from '@realitycheck/db';
import type { RunDetail, RunListItem } from '@realitycheck/shared';

const MAX_JOURNEYS_PER_RUN = 10;
const MAX_ACTIONS_PER_JOURNEY = 100;

type StoredAction = {
  id: string;
  position: number;
  type: string;
  target: string | null;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  detail: unknown;
  createdAt: Date;
};

/** Produces the bounded, user-safe subset of a persisted browser action. */
export function projectActionForRunDetail(action: StoredAction) {
  const detail = asRecord(action.detail);
  return {
    id: action.id,
    position: action.position,
    type: truncate(action.type, 80),
    target: sanitizeTarget(action.target),
    status: action.status,
    detail: {
      label: sanitizeText(detail?.label, 160),
      beforeUrl: sanitizeLocation(detail?.beforeUrl),
      afterUrl: sanitizeLocation(detail?.afterUrl),
      reason: sanitizeActionReason(detail?.error),
    },
    createdAt: action.createdAt,
  };
}

export type RunRepository = {
  createQueuedRun(targetId: string): Promise<RunListItem | null>;
  failQueueing(runId: string): Promise<RunListItem>;
  findRun(id: string): Promise<RunDetail | null>;
  findArtifact(
    runId: string,
    artifactId: string,
  ): Promise<{ storageKey: string; contentType: string | null } | null>;
};

export function createRunRepository(prisma: PrismaClient): RunRepository {
  return {
    async createQueuedRun(targetId) {
      const target = await prisma.target.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!target) return null;

      const run = await prisma.$transaction(async (transaction) => {
        const created = await transaction.run.create({ data: { targetId } });
        await transaction.runEvent.create({
          data: {
            runId: created.id,
            type: 'RUN_QUEUED',
            message: 'Run queued for browser execution',
          },
        });
        return transaction.run.findUniqueOrThrow({
          where: { id: created.id },
          select: runListSelect,
        });
      });
      return run;
    },

    async failQueueing(runId) {
      const run = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.run.update({
          where: { id: runId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            error: 'Run could not be queued for browser execution',
          },
          select: runListSelect,
        });
        await transaction.runEvent.create({
          data: {
            runId,
            type: 'QUEUE_FAILED',
            message: 'Run could not be queued for browser execution',
          },
        });
        return updated;
      });
      return run;
    },

    async findRun(id) {
      const run = await prisma.run.findUnique({
        where: { id },
        select: {
          ...runListSelect,
          error: true,
          events: { orderBy: { createdAt: 'asc' }, take: 100, select: runEventSelect },
          artifacts: { orderBy: { createdAt: 'asc' }, take: 20, select: artifactSelect },
          findings: { orderBy: { createdAt: 'asc' }, take: 30, select: findingSelect },
          journeys: {
            orderBy: { position: 'asc' },
            take: MAX_JOURNEYS_PER_RUN,
            select: {
              id: true,
              name: true,
              position: true,
              status: true,
              actions: {
                orderBy: { position: 'asc' },
                take: MAX_ACTIONS_PER_JOURNEY,
                select: actionSelect,
              },
            },
          },
        },
      });
      if (!run) return null;
      return {
        ...run,
        journeys: run.journeys.map((journey) => ({
          ...journey,
          actions: journey.actions.map(projectActionForRunDetail),
        })),
      };
    },

    async findArtifact(runId, artifactId) {
      return prisma.artifact.findFirst({
        where: { id: artifactId, runId },
        select: { storageKey: true, contentType: true },
      });
    },
  };
}

const runListSelect = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  completedAt: true,
  target: { select: { id: true, url: true } },
} as const;

const runEventSelect = {
  id: true,
  type: true,
  message: true,
  data: true,
  createdAt: true,
} as const;

const artifactSelect = {
  id: true,
  kind: true,
  storageKey: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
} as const;

const findingSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  fingerprint: true,
  createdAt: true,
} as const;

const actionSelect = {
  id: true,
  position: true,
  type: true,
  target: true,
  status: true,
  detail: true,
  createdAt: true,
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeTarget(value: string | null): string | null {
  if (!value) return null;
  return sanitizeLocation(value) ?? sanitizeText(value, 160);
}

function sanitizeLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return truncate(url.toString(), 300);
  } catch {
    return null;
  }
}

function sanitizeText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  return truncate(
    value.replace(
      /\b(authorization)\b\s*[:=]\s*(?:bearer\s+)?[^\r\n]+|\b(cookie|set-cookie|token|api[_ -]?key|password|secret)\b\s*[:=]\s*[^\s,;]+/gi,
      (_match, authorization: string | undefined, credential: string | undefined) =>
        `${authorization ?? credential}=[redacted]`,
    ),
    limit,
  );
}

function sanitizeActionReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (
    value === 'Action was not selected within the exploration budget' ||
    value === 'Action was rejected by the browser safety policy' ||
    value === 'Action is not allowed by the browser exploration policy'
  ) {
    return value;
  }
  if (/^Initial navigation returned HTTP \d{3}; no interactions were attempted\.$/.test(value)) {
    return value;
  }
  return 'Action execution failed';
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
