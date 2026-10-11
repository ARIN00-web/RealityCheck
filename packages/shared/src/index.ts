export const RUN_QUEUE_NAME = 'exploration-runs';
export const REGRESSION_QUEUE_NAME = 'regression-runs';

export type HealthResponse = {
  status: 'ok' | 'unavailable';
  service: string;
  timestamp: string;
  checks?: Record<string, 'ok' | 'unavailable'>;
};

import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const targetUrlSchema = z
  .string()
  .trim()
  .min(1, 'A website URL is required')
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only HTTP and HTTPS website URLs are supported',
        });
      }
      if (url.username || url.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Website URLs must not include credentials',
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid website URL',
      });
    }
  });

export const createTargetRequestSchema = z
  .object({ url: targetUrlSchema })
  .strict()
  .transform(({ url }) => ({ url: normalizeTargetUrl(url) }));

export function normalizeTargetUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = '';
  return url.toString();
}

const runStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'CANCEL_REQUESTED',
  'CANCELED',
  'SUCCEEDED',
  'FAILED',
]);

export const targetSummarySchema = z.object({
  id: z.string(),
  url: z.string().url(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  runCount: z.number().int().nonnegative(),
});

export const runSummarySchema = z.object({
  id: z.string(),
  status: runStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
});

export const runEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  message: z.string(),
  data: z.unknown().nullable(),
  createdAt: z.coerce.date(),
});

export const artifactSchema = z.object({
  id: z.string(),
  kind: z.enum(['GENERATED_TEST', 'REPORT', 'OTHER']),
  storageKey: z.string(),
  contentType: z.string().nullable(),
  byteSize: z.number().int().nullable(),
  createdAt: z.coerce.date(),
});

export const findingSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['CANDIDATE', 'VERIFYING', 'VERIFIED', 'INCONCLUSIVE', 'RESOLVED']),
  fingerprint: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const actionDetailSchema = z.object({
  label: z.string().nullable(),
  beforeUrl: z.string().nullable(),
  afterUrl: z.string().nullable(),
  reason: z.string().nullable(),
});

export const actionSchema = z.object({
  id: z.string(),
  position: z.number().int().nonnegative(),
  type: z.string(),
  target: z.string().nullable(),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED']),
  detail: actionDetailSchema,
  createdAt: z.coerce.date(),
});

export const journeySchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
  actions: z.array(actionSchema),
});

export const targetDetailSchema = targetSummarySchema.extend({
  runs: z.array(runSummarySchema),
});

export const runListItemSchema = runSummarySchema.extend({
  target: z.object({
    id: z.string(),
    url: z.string().url(),
  }),
});

export const runDetailSchema = runListItemSchema.extend({
  error: z.string().nullable(),
  events: z.array(runEventSchema),
  artifacts: z.array(artifactSchema),
  findings: z.array(findingSchema).default([]),
  journeys: z.array(journeySchema).default([]),
});

export const regressionEligibilitySchema = z.object({
  findingId: z.string(),
  title: z.string(),
  eligible: z.boolean(),
  reason: z.string().nullable(),
});
export const regressionSpecificationSchema = z.object({
  version: z.literal(1),
  findingId: z.string(),
  targetId: z.string(),
  initialUrl: z.string().url(),
  createdAt: z.string(),
  steps: z
    .array(
      z.object({
        type: z.enum(['navigate', 'click', 'fill']),
        target: z.string(),
        label: z.string().nullable(),
      }),
    )
    .max(8),
  assertion: z.object({
    kind: z.enum(['absence_of_recorded_browser_error', 'http_status_not_5xx']),
  }),
});
export const regressionTestSchema = z.object({
  id: z.string(),
  findingId: z.string(),
  name: z.string(),
  createdAt: z.coerce.date(),
  specification: regressionSpecificationSchema,
});

export const runJobDataSchema = z.object({ runId: z.string().min(1) });
export type RunJobData = z.infer<typeof runJobDataSchema>;

export const regressionJobDataSchema = z.object({
  regressionTestId: z.string().min(1),
  executionId: z.string().min(1),
});
export type RegressionJobData = z.infer<typeof regressionJobDataSchema>;

export const regressionExecutionStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'PASSED',
  'FAILED',
  'ERROR',
]);
export type RegressionExecutionStatus = z.infer<typeof regressionExecutionStatusSchema>;

export const regressionAssertionResultSchema = z.object({
  kind: z.string(),
  passed: z.boolean(),
  actual: z.unknown().optional(),
  expected: z.unknown().optional(),
  message: z.string().nullable().optional(),
});
export type RegressionAssertionResult = z.infer<typeof regressionAssertionResultSchema>;

export const regressionExecutionSchema = z.object({
  id: z.string(),
  regressionTestId: z.string(),
  attemptNumber: z.number().int().positive(),
  status: regressionExecutionStatusSchema,
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  failureReason: z.string().nullable(),
  message: z.string().nullable().optional(),
  assertions: z.array(regressionAssertionResultSchema).nullable().optional(),
  createdAt: z.coerce.date(),
});
export type RegressionExecution = z.infer<typeof regressionExecutionSchema>;

export const assertionComparisonItemSchema = z.object({
  kind: z.string(),
  previousPassed: z.boolean().nullable(),
  currentPassed: z.boolean(),
  status: z.enum(['PASSED', 'FAILED', 'RECOVERED', 'REGRESSED', 'UNCHANGED']),
  message: z.string().nullable().optional(),
});
export type AssertionComparisonItem = z.infer<typeof assertionComparisonItemSchema>;

export const executionComparisonSchema = z.object({
  status: z.enum(['NO_PREDECESSOR', 'INCONCLUSIVE', 'REGRESSED', 'RECOVERED', 'UNCHANGED']),
  previousAttemptNumber: z.number().int().positive().nullable(),
  currentAttemptNumber: z.number().int().positive(),
  previousStatus: regressionExecutionStatusSchema.nullable(),
  currentStatus: regressionExecutionStatusSchema,
  headline: z.string(),
  reason: z.string().nullable(),
  assertions: z.array(assertionComparisonItemSchema),
});
export type ExecutionComparison = z.infer<typeof executionComparisonSchema>;

export type CreateTargetRequest = z.infer<typeof createTargetRequestSchema>;
export type TargetSummary = z.infer<typeof targetSummarySchema>;
export type TargetDetail = z.infer<typeof targetDetailSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunListItem = z.infer<typeof runListItemSchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type RegressionEligibility = z.infer<typeof regressionEligibilitySchema>;
export type RegressionSpecification = z.infer<typeof regressionSpecificationSchema>;
export type RegressionTest = z.infer<typeof regressionTestSchema>;
