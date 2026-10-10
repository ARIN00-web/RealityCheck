export const RUN_QUEUE_NAME = 'exploration-runs';

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
});

export const runJobDataSchema = z.object({ runId: z.string().min(1) });
export type RunJobData = z.infer<typeof runJobDataSchema>;

export type CreateTargetRequest = z.infer<typeof createTargetRequestSchema>;
export type TargetSummary = z.infer<typeof targetSummarySchema>;
export type TargetDetail = z.infer<typeof targetDetailSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunListItem = z.infer<typeof runListItemSchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
