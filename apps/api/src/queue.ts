import { Queue } from 'bullmq';
import {
  REGRESSION_QUEUE_NAME,
  RUN_QUEUE_NAME,
  type RegressionJobData,
  type RunJobData,
} from '@realitycheck/shared';
import type { Redis } from 'ioredis';

export type RunQueue = { enqueue(runId: string): Promise<void> };

export function createRunQueue(connection: Redis): RunQueue {
  const queue = new Queue<RunJobData>(RUN_QUEUE_NAME, { connection });
  return {
    async enqueue(runId) {
      await queue.add(
        RUN_QUEUE_NAME,
        { runId },
        {
          jobId: runId,
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    },
  };
}

export type RegressionQueue = {
  enqueue(regressionTestId: string, executionId: string): Promise<void>;
};

export function createRegressionQueue(connection: Redis): RegressionQueue {
  const queue = new Queue<RegressionJobData>(REGRESSION_QUEUE_NAME, { connection });
  return {
    async enqueue(regressionTestId, executionId) {
      await queue.add(
        REGRESSION_QUEUE_NAME,
        { regressionTestId, executionId },
        {
          jobId: executionId,
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    },
  };
}
