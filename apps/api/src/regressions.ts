import type { PrismaClient } from '@realitycheck/db';
import {
  assessRegressionEligibility,
  compareExecutionAttempts,
  createRegressionSpecification,
  sanitizeFailureReason,
  type RecordedAction,
} from '@realitycheck/regression';
import {
  regressionSpecificationSchema,
  type ExecutionComparison,
  type RegressionExecution,
  type RegressionSpecification,
} from '@realitycheck/shared';

export type QueuedExecutionResult =
  | { kind: 'success'; execution: RegressionExecution }
  | { kind: 'not_found' }
  | { kind: 'invalid_specification'; reason: string }
  | { kind: 'active_conflict'; activeExecutionId: string };

export function createRegressionRepository(prisma: PrismaClient) {
  return {
    async listFindings(targetId: string) {
      const findings = await prisma.finding.findMany({
        where: { run: { targetId } },
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          verifiedAt: true,
          description: true,
          journey: {
            select: {
              actions: {
                orderBy: { position: 'asc' },
                take: 8,
                select: {
                  id: true,
                  position: true,
                  type: true,
                  target: true,
                  status: true,
                  detail: true,
                },
              },
            },
          },
          run: {
            select: {
              journeys: {
                select: {
                  actions: {
                    orderBy: { position: 'asc' },
                    take: 8,
                    select: {
                      id: true,
                      position: true,
                      type: true,
                      target: true,
                      status: true,
                      detail: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      return findings.map((f) => {
        const actions =
          f.journey?.actions && f.journey.actions.length > 0
            ? f.journey.actions
            : (f.run?.journeys?.[0]?.actions ?? []);
        const e = assessRegressionEligibility(f, actions as RecordedAction[]);
        return {
          findingId: f.id,
          title: f.title,
          eligible: e.eligible,
          reason: e.eligible ? null : e.reason,
        };
      });
    },
    async verifyFinding(findingId: string) {
      const finding = await prisma.finding.findUnique({
        where: { id: findingId },
        select: { id: true, title: true, status: true, verifiedAt: true },
      });
      if (!finding) return null;
      return await prisma.finding.update({
        where: { id: findingId },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
        select: { id: true, title: true, status: true, verifiedAt: true },
      });
    },
    async generate(findingId: string) {
      const finding = await prisma.finding.findUnique({
        where: { id: findingId },
        select: {
          id: true,
          title: true,
          status: true,
          verifiedAt: true,
          description: true,
          run: {
            select: {
              targetId: true,
              target: { select: { url: true } },
              journeys: {
                select: {
                  actions: {
                    orderBy: { position: 'asc' },
                    take: 8,
                    select: {
                      id: true,
                      position: true,
                      type: true,
                      target: true,
                      status: true,
                      detail: true,
                    },
                  },
                },
              },
            },
          },
          journey: {
            select: {
              actions: {
                orderBy: { position: 'asc' },
                take: 8,
                select: {
                  id: true,
                  position: true,
                  type: true,
                  target: true,
                  status: true,
                  detail: true,
                },
              },
            },
          },
        },
      });
      if (!finding) return null;
      const actions =
        finding.journey?.actions && finding.journey.actions.length > 0
          ? finding.journey.actions
          : (finding.run?.journeys?.[0]?.actions ?? []);
      const spec = createRegressionSpecification({
        finding,
        targetId: finding.run.targetId,
        targetUrl: finding.run.target.url,
        actions: actions as RecordedAction[],
      });
      const test = await prisma.regressionTest.upsert({
        where: { findingId_specificationVersion: { findingId, specificationVersion: 1 } },
        create: { findingId, name: finding.title.slice(0, 160), specification: spec },
        update: {},
        select: { id: true, findingId: true, name: true, createdAt: true, specification: true },
      });
      return project(test);
    },
    async list(targetId: string) {
      const rows = await prisma.regressionTest.findMany({
        where: { finding: { run: { targetId } } },
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: { id: true, findingId: true, name: true, createdAt: true, specification: true },
      });
      return rows.map(project);
    },
    async find(id: string) {
      const row = await prisma.regressionTest.findUnique({
        where: { id },
        select: { id: true, findingId: true, name: true, createdAt: true, specification: true },
      });
      return row ? project(row) : null;
    },
    async createQueuedExecution(regressionTestId: string): Promise<QueuedExecutionResult> {
      const test = await prisma.regressionTest.findUnique({
        where: { id: regressionTestId },
        select: { id: true, specification: true },
      });
      if (!test) return { kind: 'not_found' };

      const specValidation = regressionSpecificationSchema.safeParse(test.specification);
      if (!specValidation.success) {
        return {
          kind: 'invalid_specification',
          reason: specValidation.error.message,
        };
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const active = await tx.regressionExecution.findFirst({
            where: {
              regressionTestId,
              status: { in: ['QUEUED', 'RUNNING'] },
            },
            select: { id: true },
          });
          if (active) {
            return { kind: 'active_conflict' as const, activeExecutionId: active.id };
          }

          const lastAttempt = await tx.regressionExecution.findFirst({
            where: { regressionTestId },
            orderBy: { attemptNumber: 'desc' },
            select: { attemptNumber: true },
          });
          const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;

          const created = await tx.regressionExecution.create({
            data: {
              regressionTestId,
              attemptNumber,
              status: 'QUEUED',
              startedAt: null,
              completedAt: null,
              failureReason: null,
              message: 'Regression execution queued',
            },
          });

          return { kind: 'success' as const, execution: projectExecution(created) };
        });

        return result;
      } catch (error: any) {
        if (error?.code === 'P2002') {
          return { kind: 'active_conflict', activeExecutionId: 'concurrent-active-execution' };
        }
        throw error;
      }
    },
    async failQueueing(executionId: string, errorReason?: string): Promise<RegressionExecution> {
      const updated = await prisma.regressionExecution.update({
        where: { id: executionId },
        data: {
          status: 'ERROR',
          completedAt: new Date(),
          failureReason: errorReason ? sanitizeFailureReason(errorReason) : 'Queue dispatch failed',
          message: 'Failed to enqueue regression execution job',
        },
      });
      return projectExecution(updated);
    },
    async findExecution(id: string): Promise<RegressionExecution | null> {
      const row = await prisma.regressionExecution.findUnique({
        where: { id },
      });
      return row ? projectExecution(row) : null;
    },
    async listExecutions(regressionTestId: string): Promise<RegressionExecution[]> {
      const rows = await prisma.regressionExecution.findMany({
        where: { regressionTestId },
        orderBy: { attemptNumber: 'desc' },
        take: 50,
      });
      return rows.map(projectExecution);
    },
    async compareExecutions(regressionTestId: string): Promise<ExecutionComparison | null> {
      const rows = await prisma.regressionExecution.findMany({
        where: { regressionTestId },
        orderBy: { attemptNumber: 'desc' },
        take: 2,
      });
      if (rows.length === 0) return null;
      const current = projectExecution(rows[0]);
      const previous = rows.length > 1 ? projectExecution(rows[1]) : null;
      return compareExecutionAttempts(current, previous);
    },
  };
}

function project(row: {
  id: string;
  findingId: string;
  name: string;
  createdAt: Date;
  specification: unknown;
}) {
  return {
    id: row.id,
    findingId: row.findingId,
    name: row.name.slice(0, 160),
    createdAt: row.createdAt,
    specification: row.specification as RegressionSpecification,
  };
}

function projectExecution(row: {
  id: string;
  regressionTestId: string;
  attemptNumber: number;
  status: any;
  startedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
  message: string | null;
  assertions?: unknown;
  createdAt: Date;
}): RegressionExecution {
  return {
    id: row.id,
    regressionTestId: row.regressionTestId,
    attemptNumber: row.attemptNumber,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failureReason: row.failureReason,
    message: row.message,
    assertions: (row.assertions as any) ?? null,
    createdAt: row.createdAt,
  };
}
