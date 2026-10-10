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
  kind: 'navigate' | 'click' | 'submit-empty';
  selector?: string;
  href?: string;
  label: string;
};

export type ExplorationPage = {
  url: string;
  title: string | null;
  text: string;
  actions: ExplorationCandidateAction[];
};

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
  pagesExplored: number;
};

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

    const candidates = await planner(await describePage(page, url));
    for (const action of candidates.slice(0, options.actionLimit)) {
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
    return { observation, actions, pagesExplored };
  } catch (error) {
    observation.finalUrl = page.url() || null;
    observation.navigation.durationMs = Date.now() - startedAt;
    observation.navigation.outcome = 'failed';
    if (error instanceof UnsafeDestinationError) throw error;
    throw new Error('Browser exploration failed');
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
  const description = await page.evaluate((allowedOrigin) => {
    const label = (element: Element): string =>
      (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim();
    const actions: ExplorationCandidateAction[] = [];
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((element, index) => {
      const href = new URL(element.href, location.href);
      if (href.origin === allowedOrigin) {
        actions.push({
          id: `link-${index}`,
          kind: 'navigate',
          href: href.toString(),
          label: label(element),
        });
      }
    });
    document.querySelectorAll<HTMLButtonElement>('button').forEach((element, index) => {
      if (element.disabled || element.type === 'submit' || element.closest('form')) return;
      actions.push({
        id: `button-${index}`,
        kind: 'click',
        selector: `button:nth-of-type(${index + 1})`,
        label: label(element),
      });
    });
    return { text: (document.body?.innerText || '').slice(0, 2_000), actions };
  }, origin);
  return { url: page.url(), title: await page.title().catch(() => null), ...description };
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
    await page.locator(action.selector).click({ timeout });
    await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => undefined);
    return;
  }
  throw new Error('Action is not allowed by the browser exploration policy');
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
