import { chromium, type ConsoleMessage, type Page } from 'playwright';
import { assertSafeHttpUrl, UnsafeDestinationError } from './safety.js';

export type BrowserObservation = {
  targetUrl: string;
  finalUrl: string | null;
  title: string | null;
  navigation: {
    status: number | null;
    durationMs: number;
    outcome: 'loaded' | 'http_error' | 'failed';
  };
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  httpErrors: Array<{ url: string; status: number }>;
  screenshot: Buffer | null;
  screenshotError: string | null;
};

export type BrowserRunOptions = {
  navigationTimeoutMs: number;
  overallTimeoutMs: number;
  observationLimit: number;
  artifactMaxBytes: number;
};

export type ExplorationCandidateAction = {
  id: string;
  kind: 'navigate' | 'click' | 'fill' | 'submit-empty';
  selector?: string;
  href?: string;
  index?: number;
  label: string;
};

export type InspectableElement = {
  kind: 'link' | 'button' | 'input';
  href?: string;
  label: string;
  index: number;
  visible: boolean;
  disabled?: boolean;
  inForm?: boolean;
  submit?: boolean;
  roleButton?: boolean;
  inputType?: string;
};

export type ExplorationPage = {
  url: string;
  title: string | null;
  text: string;
  actions: ExplorationCandidateAction[];
  candidateSummary: CandidateSummary;
  pageSummary: PageSummary;
};

export type CandidateSummary = {
  anchors: number;
  buttons: number;
  roleButtons: number;
  textInputs: number;
  eligible: number;
  rejected: Record<string, number>;
};

export type PageSummary = { readyState: string; bodyTextLength: number };

const unsafeActionLabel =
  /\b(sign in|sign up|log in|login|create account|register|continue with|forgot password|reset password|buy|purchase|pay|checkout|order|delete|remove|destroy|publish|send|transfer|subscribe|logout|sign out)\b/i;

export type ExplorationActionResult = {
  action: ExplorationCandidateAction;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  beforeUrl: string;
  afterUrl: string;
  error: string | null;
};

export type ExplorationResult = {
  observation: BrowserObservation;
  actions: ExplorationActionResult[];
  discoveredActions: number;
  noActionReason: string | null;
  candidateSummary: CandidateSummary;
  pageSummary: PageSummary;
  pagesExplored: number;
};

type ExplorationPhase = 'navigation' | 'page_inspection' | 'planning';

/**
 * Returns a user-safe error while retaining the original failure as its cause for
 * process-level debugging. Never use the cause as a user-facing message because
 * Playwright errors can include request URLs.
 */
export function createSafeExplorationError(error: unknown, phase: ExplorationPhase): Error {
  const isTimeout =
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.message === 'Browser run timed out');
  const message =
    phase === 'navigation' && isTimeout
      ? 'Browser navigation timed out'
      : 'Browser exploration failed';
  return new Error(message, { cause: error });
}

export async function observeTarget(
  url: string,
  options: BrowserRunOptions,
): Promise<BrowserObservation> {
  await assertSafeHttpUrl(url);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const result = createObservation(url);
  const startedAt = Date.now();

  try {
    await configureSafety(page, result, options.observationLimit);
    page.setDefaultNavigationTimeout(options.navigationTimeoutMs);
    const response = await withTimeout(
      page.goto(url, { waitUntil: 'domcontentloaded' }),
      options.overallTimeoutMs,
    );
    result.finalUrl = page.url();
    result.title = await page.title().catch(() => null);
    result.navigation.status = response?.status() ?? null;
    result.navigation.durationMs = Date.now() - startedAt;
    result.navigation.outcome = response && response.status() >= 400 ? 'http_error' : 'loaded';

    try {
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
        timeout: options.navigationTimeoutMs,
      });
      if (screenshot.byteLength <= options.artifactMaxBytes) result.screenshot = screenshot;
      else result.screenshotError = 'Screenshot exceeded the configured artifact size limit';
    } catch {
      result.screenshotError = 'Screenshot capture failed';
    }
    return result;
  } catch (error) {
    result.finalUrl = page.url() || null;
    result.navigation.durationMs = Date.now() - startedAt;
    result.navigation.outcome = 'failed';
    if (error instanceof UnsafeDestinationError) throw error;
    throw new Error('Browser navigation failed');
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

/** Executes a small, same-origin exploration budget in one isolated context. */
export async function exploreTarget(
  url: string,
  options: BrowserRunOptions & { actionLimit: number },
  planner: (page: ExplorationPage) => Promise<ExplorationCandidateAction[]>,
): Promise<ExplorationResult> {
  await assertSafeHttpUrl(url);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const observation = createObservation(url);
  const startedAt = Date.now();
  const actions: ExplorationActionResult[] = [];
  let pagesExplored = 0;
  let phase: ExplorationPhase = 'navigation';

  try {
    await configureSafety(page, observation, options.observationLimit);
    page.setDefaultNavigationTimeout(options.navigationTimeoutMs);
    const response = await withTimeout(
      page.goto(url, { waitUntil: 'domcontentloaded' }),
      options.overallTimeoutMs,
    );
    pagesExplored += 1;
    observation.navigation.status = response?.status() ?? null;
    observation.navigation.outcome = response && response.status() >= 400 ? 'http_error' : 'loaded';
    observation.finalUrl = page.url();
    observation.title = await page.title().catch(() => null);
    phase = 'page_inspection';
    await waitForRenderedPage(page, options.navigationTimeoutMs);

    const description = await describePage(page, url);
    const discovered = description.actions;
    if (observation.navigation.outcome === 'http_error') {
      const reason = `Initial navigation returned HTTP ${observation.navigation.status}; no interactions were attempted.`;
      observation.navigation.durationMs = Date.now() - startedAt;
      return {
        observation: await captureScreenshot(page, observation, options),
        actions: discovered.map((action) => ({
          action,
          status: 'SKIPPED',
          beforeUrl: page.url(),
          afterUrl: page.url(),
          error: reason,
        })),
        discoveredActions: discovered.length,
        noActionReason: reason,
        candidateSummary: description.candidateSummary,
        pageSummary: description.pageSummary,
        pagesExplored,
      };
    }
    phase = 'planning';
    const proposed = await planner(description);
    const discoveredById = new Map(discovered.map((action) => [action.id, action]));
    const candidates = proposed
      .map((action) => discoveredById.get(action.id))
      .filter((action): action is ExplorationCandidateAction => Boolean(action))
      .filter(isSafeBrowserAction);
    const selected = candidates.slice(0, options.actionLimit);
    actions.push(
      ...discovered
        .filter((action) => !selected.some(({ id }) => id === action.id))
        .map((action) => ({
          action,
          status: 'SKIPPED' as const,
          beforeUrl: page.url(),
          afterUrl: page.url(),
          error: isSafeBrowserAction(action)
            ? 'Action was not selected within the exploration budget'
            : 'Action was rejected by the browser safety policy',
        })),
    );
    for (const action of selected) {
      const remainingMs = options.overallTimeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 0) break;
      const beforeUrl = page.url();
      try {
        await executeAction(page, action, Math.min(options.navigationTimeoutMs, remainingMs));
        pagesExplored += 1;
        actions.push({ action, status: 'SUCCEEDED', beforeUrl, afterUrl: page.url(), error: null });
      } catch (error) {
        actions.push({
          action,
          status: 'FAILED',
          beforeUrl,
          afterUrl: page.url(),
          error: error instanceof Error ? error.message.slice(0, 300) : 'Action failed',
        });
      }
    }
    observation.finalUrl = page.url();
    observation.title = await page.title().catch(() => null);
    observation.navigation.durationMs = Date.now() - startedAt;
    return {
      observation: await captureScreenshot(page, observation, options),
      actions,
      discoveredActions: discovered.length,
      noActionReason:
        candidates.length === 0
          ? discovered.length === 0
            ? 'No eligible same-origin interactions were available.'
            : 'Discovered interactions were rejected by the browser safety policy.'
          : null,
      candidateSummary: description.candidateSummary,
      pageSummary: description.pageSummary,
      pagesExplored,
    };
  } catch (error) {
    observation.finalUrl = page.url() || null;
    observation.navigation.durationMs = Date.now() - startedAt;
    observation.navigation.outcome = 'failed';
    if (error instanceof UnsafeDestinationError) throw error;
    throw createSafeExplorationError(error, phase);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function createObservation(targetUrl: string): BrowserObservation {
  return {
    targetUrl,
    finalUrl: null,
    title: null,
    navigation: { status: null, durationMs: 0, outcome: 'failed' },
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    screenshot: null,
    screenshotError: null,
  };
}

async function configureSafety(
  page: Page,
  result: BrowserObservation,
  limit: number,
): Promise<void> {
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') pushLimited(result.consoleErrors, message.text(), limit);
  });
  page.on('pageerror', (error) => pushLimited(result.pageErrors, error.message, limit));
  page.on('requestfailed', (request) => pushLimited(result.failedRequests, request.url(), limit));
  page.on('response', (response) => {
    if (response.status() >= 400 && result.httpErrors.length < limit) {
      result.httpErrors.push({ url: response.url(), status: response.status() });
    }
  });
  await page.context().route('**/*', async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return route.continue();
    try {
      await assertSafeHttpUrl(requestUrl);
      return route.continue();
    } catch {
      return route.abort('blockedbyclient');
    }
  });
}

async function describePage(page: Page, initialUrl: string): Promise<ExplorationPage> {
  const origin = new URL(initialUrl).origin;
  const description = await page.evaluate(() => {
    const label = (element: Element): string =>
      (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim();
    const elements: InspectableElement[] = [];
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      elements.push({
        kind: 'link',
        href: element.href,
        label: label(element),
        index,
        visible: rect.width > 0 && rect.height > 0,
      });
    });
    document.querySelectorAll<HTMLElement>('button, [role="button"]').forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      elements.push({
        kind: 'button',
        label: label(element),
        index,
        visible: rect.width > 0 && rect.height > 0,
        disabled: 'disabled' in element && Boolean(element.disabled),
        inForm: Boolean(element.closest('form')),
        submit: element instanceof HTMLButtonElement && element.type === 'submit',
        roleButton: element.getAttribute('role') === 'button',
      });
    });
    document.querySelectorAll<HTMLInputElement>('input').forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      elements.push({
        kind: 'input',
        label: element.getAttribute('aria-label') || element.placeholder || 'Text input',
        index,
        visible: rect.width > 0 && rect.height > 0,
        disabled: element.disabled || element.readOnly,
        inputType: (element.type || 'text').toLowerCase(),
      });
    });
    return {
      text: (document.body?.innerText || '').slice(0, 2_000),
      elements,
      pageSummary: {
        readyState: document.readyState,
        bodyTextLength: (document.body?.innerText || '').length,
      },
    };
  });
  return {
    url: page.url(),
    title: await page.title().catch(() => null),
    text: description.text,
    ...extractExplorationCandidatesWithSummary(description.elements, origin),
    pageSummary: description.pageSummary,
  };
}

async function executeAction(
  page: Page,
  action: ExplorationCandidateAction,
  timeout: number,
): Promise<void> {
  if (action.kind === 'navigate' && action.href) {
    await assertSafeHttpUrl(action.href);
    await page.goto(action.href, { waitUntil: 'domcontentloaded', timeout });
    return;
  }
  if (action.kind === 'click' && action.selector) {
    await page
      .locator(action.selector)
      .nth(action.index ?? 0)
      .click({ timeout });
    await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => undefined);
    return;
  }
  if (action.kind === 'fill' && action.selector) {
    await page
      .locator(action.selector)
      .nth(action.index ?? 0)
      .fill('RealityCheck test item', { timeout });
    return;
  }
  throw new Error('Action is not allowed by the browser exploration policy');
}

export function extractExplorationCandidates(
  elements: InspectableElement[],
  origin: string,
): ExplorationCandidateAction[] {
  return extractExplorationCandidatesWithSummary(elements, origin).actions;
}

export function isSafeBrowserAction(action: ExplorationCandidateAction): boolean {
  return !unsafeActionLabel.test(action.label);
}

export function extractExplorationCandidatesWithSummary(
  elements: InspectableElement[],
  origin: string,
): { actions: ExplorationCandidateAction[]; candidateSummary: CandidateSummary } {
  const candidateSummary: CandidateSummary = {
    anchors: 0,
    buttons: 0,
    roleButtons: 0,
    textInputs: 0,
    eligible: 0,
    rejected: {},
  };
  const reject = (reason: string): void => {
    candidateSummary.rejected[reason] = (candidateSummary.rejected[reason] ?? 0) + 1;
  };
  const actions = elements.reduce<ExplorationCandidateAction[]>((candidates, element) => {
    if (element.kind === 'link') candidateSummary.anchors += 1;
    else if (element.kind === 'button') {
      candidateSummary.buttons += 1;
      if (element.roleButton) candidateSummary.roleButtons += 1;
    } else candidateSummary.textInputs += 1;
    if (!element.visible) {
      reject('not_visible');
      return candidates;
    }
    if (element.disabled) {
      reject('disabled');
      return candidates;
    }
    if (element.inForm || element.submit) {
      reject('form_control');
      return candidates;
    }
    if (element.kind === 'link' && element.href) {
      const href = new URL(element.href);
      if (href.origin !== origin) {
        reject('cross_origin');
        return candidates;
      }
      candidates.push({
        id: `link-${element.index}`,
        kind: 'navigate',
        href: href.toString(),
        label: element.label || 'Link',
      });
      candidateSummary.eligible += 1;
      return candidates;
    }
    if (element.kind === 'button') {
      candidates.push({
        id: `button-${element.index}`,
        kind: 'click',
        selector: 'button, [role="button"]',
        index: element.index,
        label: element.label || 'Button',
      });
      candidateSummary.eligible += 1;
      return candidates;
    }
    if (element.kind === 'input') {
      if (element.inputType !== 'text' && element.inputType !== 'search') {
        reject('non_text_input');
        return candidates;
      }
      candidates.push({
        id: `input-${element.index}`,
        kind: 'fill',
        selector: 'input',
        index: element.index,
        label: element.label || 'Text input',
      });
      candidateSummary.eligible += 1;
      return candidates;
    }
    reject('unsupported');
    return candidates;
  }, []);
  return { actions, candidateSummary };
}

async function waitForRenderedPage(page: Page, navigationTimeoutMs: number): Promise<void> {
  const timeout = Math.min(navigationTimeoutMs, 2_000);
  await page
    .waitForFunction(() => document.readyState !== 'loading', undefined, { timeout })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout }).catch(() => undefined);
  await page
    .waitForSelector('a[href], button, [role="button"], input[type="text"], input[type="search"]', {
      state: 'attached',
      timeout,
    })
    .catch(() => undefined);
}

async function captureScreenshot(
  page: Page,
  observation: BrowserObservation,
  options: BrowserRunOptions,
): Promise<BrowserObservation> {
  try {
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      timeout: options.navigationTimeoutMs,
    });
    if (screenshot.byteLength <= options.artifactMaxBytes) observation.screenshot = screenshot;
    else observation.screenshotError = 'Screenshot exceeded the configured artifact size limit';
  } catch {
    observation.screenshotError = 'Screenshot capture failed';
  }
  return observation;
}

function pushLimited(target: string[], value: string, limit: number): void {
  if (target.length < limit) target.push(value.slice(0, 500));
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Browser run timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
