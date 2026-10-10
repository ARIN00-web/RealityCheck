import type { PrismaClient } from '@realitycheck/db';
import type {
  CreateTargetRequest,
  RunListItem,
  TargetDetail,
  TargetSummary,
} from '@realitycheck/shared';

export type TargetRepository = {
  createTarget(input: CreateTargetRequest): Promise<TargetSummary>;
  listTargets(): Promise<TargetSummary[]>;
  findTarget(id: string): Promise<TargetDetail | null>;
  listRuns(): Promise<RunListItem[]>;
};

export function createTargetRepository(prisma: PrismaClient): TargetRepository {
  return {
    async createTarget(input) {
      const target = await prisma.target.create({
        data: { url: input.url },
        select: {
          id: true,
          url: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { runs: true } },
        },
      });

      return toTargetSummary(target);
    },

    async listTargets() {
      const targets = await prisma.target.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          url: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { runs: true } },
        },
      });

      return targets.map(toTargetSummary);
    },

    async findTarget(id) {
      const target = await prisma.target.findUnique({
        where: { id },
        select: {
          id: true,
          url: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { runs: true } },
          runs: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      });

      return target ? { ...toTargetSummary(target), runs: target.runs } : null;
    },

    async listRuns() {
      return prisma.run.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          startedAt: true,
          completedAt: true,
          target: { select: { id: true, url: true } },
        },
      });
    },
  };
}

function toTargetSummary(target: {
  id: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { runs: number };
}): TargetSummary {
  return {
    id: target.id,
    url: target.url,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
    runCount: target._count.runs,
  };
}
