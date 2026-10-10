import { Queue } from 'bullmq';
import { RUN_QUEUE_NAME, type RunJobData } from '@realitycheck/shared';
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
