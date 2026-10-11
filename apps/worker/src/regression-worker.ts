import type { PrismaClient } from '@realitycheck/db';
import { PlaywrightRegressionReplayRunner } from '@realitycheck/playwright-runner';
import { sanitizeFailureReason, type RegressionReplayRunner } from '@realitycheck/regression';
import {
  regressionJobDataSchema,
  regressionSpecificationSchema,
  type RegressionJobData,
} from '@realitycheck/shared';

export type RegressionWorkerDependencies = {
  prisma: PrismaClient;
  logger?: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  runner?: RegressionReplayRunner;
};

export function createRegressionJobHandler({
  prisma,
  logger = console,
  runner = new PlaywrightRegressionReplayRunner(),
}: RegressionWorkerDependencies) {
  return async function processRegressionJob(job: { data: unknown }): Promise<void> {
    // 1. Validate the incoming job payload at worker boundary
    const parsed = regressionJobDataSchema.safeParse(job.data);
    if (!parsed.success) {
      logger.error({ errors: parsed.error.issues }, 'Invalid regression job payload');
      throw new Error(`Invalid regression job payload: ${parsed.error.message}`);
    }
    const { regressionTestId, executionId } = parsed.data;

    // 2. Load execution attempt and test from PostgreSQL
    const execution = await prisma.regressionExecution.findUnique({
      where: { id: executionId },
      include: { test: true },
    });
    if (!execution) {
      logger.warn({ executionId, regressionTestId }, 'Regression execution attempt not found');
      return;
    }
    if (execution.regressionTestId !== regressionTestId) {
      logger.error(
        { executionId, jobTestId: regressionTestId, actualTestId: execution.regressionTestId },
        'Regression execution does not match regressionTestId',
      );
      return;
    }

    // 4. Transition the attempt to RUNNING safely.
    // Atomic conditional update protects against duplicate delivery, concurrent workers, and BullMQ retries.
    const claim = await prisma.regressionExecution.updateMany({
      where: { id: executionId, status: 'QUEUED' },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        message: 'Regression replay running',
      },
    });

    if (claim.count === 0) {
      logger.info(
        { executionId, status: execution.status },
        'Skipping already-claimed or terminal regression execution',
      );
      return;
    }

    // 3. Validate the specification before execution
    const specResult = regressionSpecificationSchema.safeParse(execution.test.specification);
    if (!specResult.success) {
      const reason = sanitizeFailureReason(
        `Invalid regression specification: ${specResult.error.message}`,
      );
      await prisma.regressionExecution.update({
        where: { id: executionId },
        data: {
          status: 'ERROR',
          completedAt: new Date(),
          failureReason: reason,
          message: 'Specification validation failed',
        },
      });
      logger.error({ executionId, error: reason }, 'Specification validation failed');
      return;
    }

    const spec = specResult.data;

    // 5. Invoke clearly defined regression replay interface
    try {
      const result = await runner.replay(spec);

      // 6. Persist actual terminal status, assertion results, and failure reason
      if (result.status === 'PASSED') {
        await prisma.regressionExecution.update({
          where: { id: executionId },
          data: {
            status: 'PASSED',
            completedAt: new Date(),
            assertions: (result.assertions ?? []) as any,
            failureReason: null,
            message: 'Regression replay passed',
          },
        });
        logger.info({ executionId }, 'Regression replay passed');
      } else {
        // Assertion failure (FAILED)
        const reason = sanitizeFailureReason(result.failureReason ?? 'Assertion check failed');
        await prisma.regressionExecution.update({
          where: { id: executionId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            assertions: (result.assertions ?? []) as any,
            failureReason: reason,
            message: 'Regression replay assertion failed',
          },
        });
        logger.info({ executionId, reason }, 'Regression replay assertion failed');
      }
    } catch (error) {
      // 7. Handle unexpected errors explicitly (ERROR)
      const reason = sanitizeFailureReason(
        error instanceof Error ? error.message : 'Unexpected execution error',
      );
      await prisma.regressionExecution.update({
        where: { id: executionId },
        data: {
          status: 'ERROR',
          completedAt: new Date(),
          failureReason: reason,
          message: 'Execution encountered an unexpected error',
        },
      });
      logger.error(
        { executionId, error: reason },
        'Regression replay encountered unexpected error',
      );
    }
  };
}
