import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import {
  sanitizeFailureReason,
  type RegressionReplayAssertionResult,
  type RegressionReplayResult,
  type RegressionReplayRunner,
  type RegressionSpecification,
} from '@realitycheck/regression';
import { regressionSpecificationSchema } from '@realitycheck/shared';
import { assertSafeHttpUrl, unsafeActionLabel, UnsafeDestinationError } from './safety.js';

export type PlaywrightRegressionReplayRunnerOptions = {
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
  overallTimeoutMs?: number;
  observationLimit?: number;
  allowLocal?: boolean;
};

export class PlaywrightRegressionReplayRunner implements RegressionReplayRunner {
  private readonly navigationTimeoutMs: number;
  private readonly actionTimeoutMs: number;
  private readonly overallTimeoutMs: number;
  private readonly observationLimit: number;
  private readonly allowLocal: boolean;

  constructor(options: PlaywrightRegressionReplayRunnerOptions = {}) {
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? 10_000;
    this.actionTimeoutMs = options.actionTimeoutMs ?? 5_000;
    this.overallTimeoutMs = options.overallTimeoutMs ?? 30_000;
    this.observationLimit = options.observationLimit ?? 50;
    this.allowLocal = options.allowLocal ?? false;
  }

  async replay(specification: RegressionSpecification): Promise<RegressionReplayResult> {
    // 1. Validate specification schema strictly
    const parsed = regressionSpecificationSchema.safeParse(specification);
    if (!parsed.success) {
      const issueMessages = parsed.error.issues.map((i) => i.message).join(', ');
      throw new Error(`Invalid regression specification: ${issueMessages}`);
    }
    const spec = parsed.data;

    // Validate step bounds and contents
    if (spec.steps.length > 8) {
      throw new Error(
        `Regression specification step count (${spec.steps.length}) exceeds maximum limit of 8`,
      );
    }

    for (let i = 0; i < spec.steps.length; i++) {
      const step = spec.steps[i];
      if (!['navigate', 'click', 'fill'].includes(step.type)) {
        throw new Error(`Unsupported action type "${step.type}" at step ${i + 1}`);
      }
      if (step.label && unsafeActionLabel.test(step.label)) {
        throw new Error(
          `Destructive or unauthorized action label at step ${i + 1}: "${step.label}"`,
        );
      }
    }

    // Validate initial URL safety before launching browser
    await assertSafeHttpUrl(spec.initialUrl, { allowLocal: this.allowLocal });

    // Wrap browser execution in overall timeout
    return await withTimeout(
      this.executeReplay(spec),
      this.overallTimeoutMs,
      'Regression replay overall execution timed out',
    );
  }

  private async executeReplay(spec: RegressionSpecification): Promise<RegressionReplayResult> {
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const http5xxErrors: Array<{ url: string; status: number }> = [];

    try {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      page = await context.newPage();

      // Configure event listeners and safety interceptor
      page.on('pageerror', (err) => {
        if (pageErrors.length < this.observationLimit) {
          pageErrors.push(sanitizeFailureReason(err.message, 300));
        }
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error' && consoleErrors.length < this.observationLimit) {
          consoleErrors.push(sanitizeFailureReason(msg.text(), 300));
        }
      });

      page.on('response', (res) => {
        if (res.status() >= 500 && http5xxErrors.length < this.observationLimit) {
          http5xxErrors.push({
            url: sanitizeFailureReason(res.url(), 200),
            status: res.status(),
          });
        }
      });

      // SSRF route interception
      await context.route('**/*', async (route) => {
        const reqUrl = route.request().url();
        if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
          return route.continue();
        }
        try {
          await assertSafeHttpUrl(reqUrl, { allowLocal: this.allowLocal });
          return route.continue();
        } catch {
          return route.abort('blockedbyclient');
        }
      });

      page.setDefaultNavigationTimeout(this.navigationTimeoutMs);

      // Initial navigation
      let initialResponse;
      try {
        initialResponse = await page.goto(spec.initialUrl, {
          waitUntil: 'domcontentloaded',
          timeout: this.navigationTimeoutMs,
        });
      } catch (navErr) {
        if (navErr instanceof UnsafeDestinationError) throw navErr;
        const isTimeout =
          navErr instanceof Error &&
          (navErr.name === 'TimeoutError' ||
            navErr.message.includes('timed out') ||
            navErr.message.includes('Timeout'));
        const safeMsg = isTimeout
          ? 'Browser navigation timed out'
          : sanitizeFailureReason(navErr instanceof Error ? navErr.message : String(navErr));
        throw new Error(safeMsg, { cause: navErr });
      }

      const initialStatus = initialResponse?.status() ?? null;
      if (initialStatus && initialStatus >= 500) {
        http5xxErrors.push({
          url: sanitizeFailureReason(spec.initialUrl, 200),
          status: initialStatus,
        });
      }

      // If initial navigation returned an HTTP error, do not treat as successful
      if (initialStatus && initialStatus >= 400 && spec.assertion.kind !== 'http_status_not_5xx') {
        return {
          status: 'FAILED',
          assertions: [
            {
              kind: spec.assertion.kind,
              passed: false,
              actual: `HTTP ${initialStatus}`,
              expected: 'HTTP 2xx or 3xx',
              message: `Initial navigation returned HTTP ${initialStatus}`,
            },
          ],
          failureReason: `Initial navigation returned HTTP ${initialStatus}`,
        };
      }

      // Execute each step deterministically
      const initialOrigin = new URL(spec.initialUrl).origin;

      for (let i = 0; i < spec.steps.length; i++) {
        const step = spec.steps[i];
        try {
          if (step.type === 'navigate') {
            await assertSafeHttpUrl(step.target, { allowLocal: this.allowLocal });
            const navUrl = new URL(step.target);
            if (navUrl.origin !== initialOrigin) {
              throw new Error(`Cross-origin navigation to "${navUrl.origin}" is prohibited`);
            }
            if (step.label && unsafeActionLabel.test(step.label)) {
              throw new Error(`Destructive navigation label at step ${i + 1}: "${step.label}"`);
            }
            const res = await page.goto(step.target, {
              waitUntil: 'domcontentloaded',
              timeout: this.navigationTimeoutMs,
            });
            if (res && res.status() >= 500) {
              http5xxErrors.push({
                url: sanitizeFailureReason(step.target, 200),
                status: res.status(),
              });
            }
          } else if (step.type === 'click') {
            if (step.label && unsafeActionLabel.test(step.label)) {
              throw new Error(`Destructive click label at step ${i + 1}: "${step.label}"`);
            }
            if (/javascript:/i.test(step.target)) {
              throw new Error('JavaScript pseudo-protocol not allowed in selector');
            }

            const locator = page.locator(step.target).first();
            await locator.waitFor({ state: 'attached', timeout: this.actionTimeoutMs });

            const elementInfo = await locator.evaluate((el) => {
              const label = (el.getAttribute('aria-label') || el.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();
              const inForm = Boolean(el.closest('form'));
              const isSubmit =
                (el instanceof HTMLInputElement && el.type === 'submit') ||
                (inForm && el instanceof HTMLButtonElement && (el.type === 'submit' || !el.type));
              const isDisabled = 'disabled' in el && Boolean((el as HTMLButtonElement).disabled);
              return { label, isSubmit, isDisabled };
            });

            if (elementInfo.isDisabled) {
              return {
                status: 'FAILED',
                assertions: [
                  {
                    kind: spec.assertion.kind,
                    passed: false,
                    actual: 'element_disabled',
                    expected: 'element_enabled',
                    message: `Target element at step ${i + 1} (${step.target}) is disabled`,
                  },
                ],
                failureReason: `Target element at step ${i + 1} (${step.target}) is disabled`,
              };
            }

            if (unsafeActionLabel.test(elementInfo.label)) {
              throw new Error(
                `Element at step ${i + 1} matches destructive label: "${elementInfo.label}"`,
              );
            }

            if (elementInfo.isSubmit) {
              throw new Error(`Submitting forms is prohibited for safety at step ${i + 1}`);
            }

            await locator.click({ timeout: this.actionTimeoutMs });
            await page
              .waitForLoadState('domcontentloaded', { timeout: this.actionTimeoutMs })
              .catch(() => undefined);
            await page
              .waitForLoadState('networkidle', { timeout: Math.min(this.actionTimeoutMs, 1_000) })
              .catch(() => undefined);
          } else if (step.type === 'fill') {
            if (step.label && unsafeActionLabel.test(step.label)) {
              throw new Error(`Destructive fill label at step ${i + 1}: "${step.label}"`);
            }
            if (/javascript:/i.test(step.target)) {
              throw new Error('JavaScript pseudo-protocol not allowed in selector');
            }

            const locator = page.locator(step.target).first();
            await locator.waitFor({ state: 'attached', timeout: this.actionTimeoutMs });

            const inputInfo = await locator.evaluate((el) => {
              const inputType =
                el instanceof HTMLInputElement ? (el.type || 'text').toLowerCase() : 'text';
              const label = (
                el.getAttribute('aria-label') ||
                ('placeholder' in el ? (el as HTMLInputElement).placeholder : '') ||
                ''
              ).trim();
              const isDisabled =
                ('disabled' in el && Boolean((el as HTMLInputElement).disabled)) ||
                ('readOnly' in el && Boolean((el as HTMLInputElement).readOnly));
              return { inputType, label, isDisabled };
            });

            if (inputInfo.isDisabled) {
              return {
                status: 'FAILED',
                assertions: [
                  {
                    kind: spec.assertion.kind,
                    passed: false,
                    actual: 'input_disabled_or_readonly',
                    expected: 'input_editable',
                    message: `Input element at step ${i + 1} (${step.target}) is disabled or read-only`,
                  },
                ],
                failureReason: `Input element at step ${i + 1} (${step.target}) is disabled or read-only`,
              };
            }

            const forbiddenTypes = ['password', 'hidden', 'file', 'submit', 'image', 'reset'];
            if (forbiddenTypes.includes(inputInfo.inputType)) {
              throw new Error(
                `Filling input of type "${inputInfo.inputType}" is prohibited at step ${i + 1}`,
              );
            }

            if (unsafeActionLabel.test(inputInfo.label)) {
              throw new Error(
                `Input at step ${i + 1} matches destructive label: "${inputInfo.label}"`,
              );
            }

            await locator.fill('RealityCheck test item', { timeout: this.actionTimeoutMs });
          }
        } catch (stepErr) {
          // Re-throw safety violations, SSRF, or forbidden errors as Error so it leads to ERROR status
          if (
            stepErr instanceof UnsafeDestinationError ||
            (stepErr instanceof Error &&
              (stepErr.message.includes('prohibited') ||
                stepErr.message.includes('destructive') ||
                stepErr.message.includes('Destructive') ||
                stepErr.message.includes('not allowed') ||
                stepErr.message.includes('matches destructive label')))
          ) {
            throw stepErr;
          }

          // Step DOM failure (e.g. element not found or timeout): report FAILED with failed assertion
          const sanitizedMsg = sanitizeFailureReason(
            stepErr instanceof Error ? stepErr.message : String(stepErr),
            300,
          );
          return {
            status: 'FAILED',
            assertions: [
              {
                kind: spec.assertion.kind,
                passed: false,
                actual: `step_${i + 1}_failed`,
                expected: `step_${i + 1}_succeeded`,
                message: `Step ${i + 1} (${step.type}) failed: ${sanitizedMsg}`,
              },
            ],
            failureReason: `Step ${i + 1} (${step.type}) failed: ${sanitizedMsg}`,
          };
        }
      }

      await page
        .waitForLoadState('networkidle', { timeout: Math.min(this.actionTimeoutMs, 1_000) })
        .catch(() => undefined);

      // Evaluate assertion based on actual observations
      let assertionResult: RegressionReplayAssertionResult;

      if (spec.assertion.kind === 'absence_of_recorded_browser_error') {
        const errors = [...pageErrors, ...consoleErrors];
        if (errors.length === 0) {
          assertionResult = {
            kind: 'absence_of_recorded_browser_error',
            passed: true,
            actual: [],
            expected: [],
            message: 'No recorded browser errors',
          };
        } else {
          assertionResult = {
            kind: 'absence_of_recorded_browser_error',
            passed: false,
            actual: errors.slice(0, 10),
            expected: [],
            message: `Recorded browser error: ${errors[0]}`,
          };
        }
      } else if (spec.assertion.kind === 'http_status_not_5xx') {
        if (http5xxErrors.length === 0) {
          assertionResult = {
            kind: 'http_status_not_5xx',
            passed: true,
            actual: [],
            expected: [],
            message: 'No 5xx HTTP responses recorded',
          };
        } else {
          assertionResult = {
            kind: 'http_status_not_5xx',
            passed: false,
            actual: http5xxErrors.slice(0, 10),
            expected: [],
            message: `5xx HTTP response recorded: ${http5xxErrors[0].status} for ${http5xxErrors[0].url}`,
          };
        }
      } else {
        throw new Error(`Unsupported assertion kind: ${(spec.assertion as any).kind}`);
      }

      return {
        status: assertionResult.passed ? 'PASSED' : 'FAILED',
        assertions: [assertionResult],
        failureReason: assertionResult.passed ? null : assertionResult.message,
      };
    } finally {
      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
