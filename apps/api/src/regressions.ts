import type { PrismaClient } from '@realitycheck/db';
import {
  assessRegressionEligibility,
  createRegressionSpecification,
  type RecordedAction,
} from '@realitycheck/regression';
import type { RegressionSpecification } from '@realitycheck/regression';

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
        },
      });
      return findings.map((f) => {
        const e = assessRegressionEligibility(f, (f.journey?.actions ?? []) as RecordedAction[]);
        return {
          findingId: f.id,
          title: f.title,
          eligible: e.eligible,
          reason: e.eligible ? null : e.reason,
        };
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
          run: { select: { targetId: true, target: { select: { url: true } } } },
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
      const spec = createRegressionSpecification({
        finding,
        targetId: finding.run.targetId,
        targetUrl: finding.run.target.url,
        actions: (finding.journey?.actions ?? []) as RecordedAction[],
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
