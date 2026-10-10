import type { PrismaClient } from '@realitycheck/db';
import type { RunDetail, RunListItem } from '@realitycheck/shared';

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
      return prisma.run.findUnique({
        where: { id },
        select: {
          ...runListSelect,
          error: true,
          events: { orderBy: { createdAt: 'asc' }, take: 100, select: runEventSelect },
          artifacts: { orderBy: { createdAt: 'asc' }, take: 20, select: artifactSelect },
          findings: { orderBy: { createdAt: 'asc' }, take: 30, select: findingSelect },
        },
      });
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
