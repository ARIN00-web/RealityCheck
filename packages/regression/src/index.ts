export type RegressionFinding = {
  id: string;
  status: 'CANDIDATE' | 'VERIFYING' | 'VERIFIED' | 'INCONCLUSIVE' | 'RESOLVED';
  verifiedAt: Date | null;
  title: string;
  description: string | null;
};

export type RecordedAction = {
  id: string;
  position: number;
  type: 'navigate' | 'click' | 'fill' | string;
  target: string | null;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'PENDING';
  detail: unknown;
};

export type RegressionEligibility = { eligible: true } | { eligible: false; reason: string };

export type RegressionSpecification = {
  version: 1;
  findingId: string;
  targetId: string;
  initialUrl: string;
  createdAt: string;
  steps: Array<{ type: 'navigate' | 'click' | 'fill'; target: string; label: string | null }>;
  assertion: { kind: 'absence_of_recorded_browser_error' | 'http_status_not_5xx' };
};

const unsafeLabel =
  /\b(sign in|log in|login|register|password|checkout|purchase|delete|remove|send|transfer)\b/i;

export function assessRegressionEligibility(
  finding: RegressionFinding,
  actions: RecordedAction[],
): RegressionEligibility {
  if (finding.status !== 'VERIFIED' || !finding.verifiedAt) {
    return {
      eligible: false,
      reason: 'Only independently verified findings can become regression tests.',
    };
  }
  const report = parseReport(finding.description);
  if (!report || (report.category !== 'page_error' && report.category !== 'http_error')) {
    return {
      eligible: false,
      reason: 'The finding has no supported deterministic browser assertion.',
    };
  }
  if (!actions.some((action) => isSupportedAction(action))) {
    return {
      eligible: false,
      reason: 'No recorded safe action is available to reproduce this finding.',
    };
  }
  return { eligible: true };
}

export function createRegressionSpecification(input: {
  finding: RegressionFinding;
  targetId: string;
  targetUrl: string;
  actions: RecordedAction[];
  now?: Date;
}): RegressionSpecification {
  const eligibility = assessRegressionEligibility(input.finding, input.actions);
  if (!eligibility.eligible) throw new Error(eligibility.reason);
  const report = parseReport(input.finding.description)!;
  const initialUrl = safeUrl(input.targetUrl);
  const steps = input.actions
    .filter(isSupportedAction)
    .sort((a, b) => a.position - b.position)
    .slice(0, 8)
    .map((action) => ({
      type: action.type as 'navigate' | 'click' | 'fill',
      target: action.target!,
      label: labelFromDetail(action.detail),
    }));
  return {
    version: 1,
    findingId: input.finding.id,
    targetId: input.targetId,
    initialUrl,
    createdAt: (input.now ?? new Date()).toISOString(),
    steps,
    assertion: {
      kind:
        report.category === 'http_error'
          ? 'http_status_not_5xx'
          : 'absence_of_recorded_browser_error',
    },
  };
}

function isSupportedAction(action: RecordedAction): boolean {
  return (
    Boolean(action.target) &&
    action.status === 'SUCCEEDED' &&
    ['navigate', 'click', 'fill'].includes(action.type) &&
    !unsafeLabel.test(labelFromDetail(action.detail) ?? '')
  );
}

function safeUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Regression target URL is unsafe.');
  url.search = '';
  url.hash = '';
  return url.toString();
}

function parseReport(value: string | null): { category?: string } | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as { category?: string };
  } catch {
    return null;
  }
}

function labelFromDetail(value: unknown): string | null {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).label === 'string'
    ? ((value as Record<string, unknown>).label as string).slice(0, 160)
    : null;
}

export type RegressionReplayAssertionResult = {
  kind: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
  message?: string | null;
};

export type RegressionReplayResult = {
  status: 'PASSED' | 'FAILED';
  assertions: RegressionReplayAssertionResult[];
  failureReason?: string | null;
};

export interface RegressionReplayRunner {
  replay(specification: RegressionSpecification): Promise<RegressionReplayResult>;
}

export class NotImplementedRegressionRunner implements RegressionReplayRunner {
  async replay(_specification: RegressionSpecification): Promise<RegressionReplayResult> {
    throw new Error('Regression replay is not yet implemented (Phase 2)');
  }
}

export function sanitizeFailureReason(value: unknown, maxLength = 500): string {
  if (!value) return 'Unknown error';
  const str =
    typeof value === 'string' ? value : value instanceof Error ? value.message : String(value);

  const redacted = str
    .replace(
      /\b(authorization)\b\s*[:=]\s*(?:bearer\s+)?[^\r\n\s]+|\b(cookie|set-cookie|token|api[_ -]?key|password|secret)\b\s*[:=]\s*[^\s,;]+/gi,
      (_match, auth: string | undefined, cred: string | undefined) => `${auth ?? cred}=[redacted]`,
    )
    .replace(/([?&](?:token|password|secret|key|api_key|access_token)=)[^&]+/gi, '$1[redacted]');

  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 1)}…` : redacted;
}
