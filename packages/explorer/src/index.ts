import type { GeminiProvider } from '@realitycheck/llm';
import { z } from 'zod';

export type ExplorationAction = {
  id: string;
  kind: 'navigate' | 'click' | 'fill' | 'submit-empty';
  selector?: string;
  href?: string;
  label: string;
};

export type PageDescription = {
  url: string;
  title: string | null;
  text: string;
  actions: ExplorationAction[];
};

export type ExplorationFinding = {
  fingerprint: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  confidence: 'low' | 'medium';
  category: 'page_error' | 'network_error' | 'http_error' | 'navigation_failure';
  affectedUrl: string;
  expected: string;
  actual: string;
  actionId: string | null;
  summary: string;
  preconditions: string[];
  reproductionSteps: string[];
  rationale: string;
  evidence: Array<{ kind: 'http' | 'network' | 'page_error'; detail: string }>;
};

export const findingVerificationRule =
  'A finding is verified only after the same fingerprint is independently reproduced in a separate completed run with at least one supporting browser error or HTTP 5xx observation.';

export function canVerifyFinding(input: {
  independentReproductions: number;
  supportingEvidence: number;
  statusCode?: number;
}): boolean {
  return (
    input.independentReproductions >= 2 &&
    input.supportingEvidence >= 2 &&
    (input.statusCode === undefined || input.statusCode >= 500)
  );
}

const modelPlanSchema = z.object({ actionIds: z.array(z.string()).max(8) }).strict();
const destructivePattern =
  /\b(sign in|sign up|log in|login|create account|register|continue with|forgot password|reset password|buy|purchase|pay|checkout|order|delete|remove|destroy|publish|send|transfer|subscribe|logout|sign out)\b/i;

/** The model may only reorder this allow-listed set; page text is never instructions. */
export function selectSafeActions(
  actions: ExplorationAction[],
  limit: number,
): ExplorationAction[] {
  const seen = new Set<string>();
  return actions
    .filter((action) => {
      const identity = `${action.kind}:${action.href ?? action.selector ?? ''}`;
      if (
        seen.has(identity) ||
        destructivePattern.test(action.label) ||
        (action.kind === 'navigate' && !action.href)
      ) {
        return false;
      }
      seen.add(identity);
      return true;
    })
    .slice(0, limit);
}

export async function prioritizeActions(
  page: PageDescription,
  options: { provider?: GeminiProvider; timeoutMs: number; limit: number },
): Promise<{ actions: ExplorationAction[]; usedFallback: boolean }> {
  const deterministic = selectSafeActions(page.actions, options.limit);
  if (!options.provider || deterministic.length === 0) {
    return { actions: deterministic, usedFallback: true };
  }
  try {
    const response = await withTimeout(
      options.provider.generate({ prompt: planningPrompt(page, deterministic) }),
      options.timeoutMs,
    );
    const plan = modelPlanSchema.safeParse(JSON.parse(response.text));
    if (!plan.success) return { actions: deterministic, usedFallback: true };
    const allowed = new Map(deterministic.map((action) => [action.id, action]));
    const proposed = plan.data.actionIds
      .map((id) => allowed.get(id))
      .filter((action): action is ExplorationAction => Boolean(action));
    return {
      actions: proposed.length > 0 ? proposed.slice(0, options.limit) : deterministic,
      usedFallback: proposed.length === 0,
    };
  } catch {
    return { actions: deterministic, usedFallback: true };
  }
}

export function createFindings(input: {
  url: string;
  actionId: string | null;
  pageErrors: string[];
  failedRequests: string[];
  httpErrors: Array<{ url: string; status: number }>;
  navigationFailed: boolean;
}): ExplorationFinding[] {
  const findings: ExplorationFinding[] = [];
  for (const error of unique(input.pageErrors)) {
    findings.push(
      finding(input, 'page_error', 'Uncaught page error', error, 'high', 'medium', 'page_error'),
    );
  }
  for (const request of unique(input.failedRequests)) {
    findings.push(
      finding(
        input,
        'network_error',
        'Network request failed',
        request,
        'medium',
        'low',
        'network',
      ),
    );
  }
  for (const response of input.httpErrors) {
    findings.push(
      finding(
        input,
        'http_error',
        `HTTP ${response.status} response`,
        redactUrl(response.url),
        'medium',
        response.status >= 500 ? 'medium' : 'low',
        'http',
      ),
    );
  }
  if (input.navigationFailed) {
    findings.push(
      finding(
        input,
        'navigation_failure',
        'Navigation failed',
        'The browser could not complete navigation.',
        'high',
        'medium',
        'page_error',
      ),
    );
  }
  return deduplicateFindings(findings);
}

export function deduplicateFindings(findings: ExplorationFinding[]): ExplorationFinding[] {
  const seen = new Set<string>();
  return findings.filter(
    (item) => !seen.has(item.fingerprint) && Boolean(seen.add(item.fingerprint)),
  );
}

function finding(
  input: Parameters<typeof createFindings>[0],
  category: ExplorationFinding['category'],
  title: string,
  actual: string,
  severity: ExplorationFinding['severity'],
  confidence: ExplorationFinding['confidence'],
  evidenceKind: ExplorationFinding['evidence'][number]['kind'],
): ExplorationFinding {
  const affectedUrl = redactUrl(input.url);
  return {
    fingerprint: `${category}:${affectedUrl}:${actual.slice(0, 160)}`,
    title,
    severity,
    confidence,
    category,
    affectedUrl,
    expected: 'The page should complete this browser operation without an error.',
    actual: actual.slice(0, 500),
    actionId: input.actionId,
    summary:
      category === 'http_error'
        ? 'A browser request returned an HTTP error. This is an observation, not proof of an application defect.'
        : 'A browser operation produced an unexpected error observation.',
    preconditions: ['Open the affected page in a new browser context.'],
    reproductionSteps: [
      'Navigate to the affected page.',
      'Observe the recorded browser operation.',
    ],
    rationale:
      category === 'http_error'
        ? 'A single HTTP response can be expected behavior, especially for authentication, authorization, or optional resources.'
        : 'The candidate is retained because browser instrumentation captured a concrete error signal.',
    evidence: [{ kind: evidenceKind, detail: actual.slice(0, 500) }],
  };
}

function planningPrompt(page: PageDescription, actions: ExplorationAction[]): string {
  return JSON.stringify({
    task: 'Return JSON only: {"actionIds":[...]}. Prioritize the supplied safe action IDs.',
    page: {
      url: redactUrl(page.url),
      title: page.title?.slice(0, 160) ?? null,
      text: page.text.slice(0, 1_500),
    },
    actions: actions.map(({ id, kind, label }) => ({ id, kind, label: label.slice(0, 160) })),
  });
}

function redactUrl(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Gemini planning timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
