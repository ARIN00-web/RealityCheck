import http from 'node:http';
import { chromium } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RegressionSpecification } from '@realitycheck/regression';
import { PlaywrightRegressionReplayRunner } from './replay.js';
import { UnsafeDestinationError } from './safety.js';

function createTestServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        server,
        url,
        close: () => new Promise((resClose) => server.close(() => resClose())),
      });
    });
  });
}

describe('PlaywrightRegressionReplayRunner', () => {
  let activeServer: { server: http.Server; url: string; close: () => Promise<void> } | undefined;

  afterEach(async () => {
    if (activeServer) {
      await activeServer.close();
      activeServer = undefined;
    }
  });

  it('successfully executes deterministic steps and passes absence_of_recorded_browser_error', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="counter-btn" onclick="document.getElementById('status').innerText = 'clicked'">Click Me</button>
          <input id="text-input" type="text" placeholder="Type here" />
          <div id="status">initial</div>
        </body>
        </html>
      `);
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'finding-1',
      targetId: 'target-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [
        { type: 'click', target: '#counter-btn', label: 'Click Me' },
        { type: 'fill', target: '#text-input', label: 'Type here' },
      ],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    const result = await runner.replay(spec);

    expect(result.status).toBe('PASSED');
    expect(result.failureReason).toBeNull();
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0]).toMatchObject({
      kind: 'absence_of_recorded_browser_error',
      passed: true,
    });
  });

  it('successfully executes and passes http_status_not_5xx assertion', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Do Nothing</button>
        </body>
        </html>
      `);
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'finding-1',
      targetId: 'target-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'click', target: '#btn', label: 'Do Nothing' }],
      assertion: { kind: 'http_status_not_5xx' },
    };

    const result = await runner.replay(spec);

    expect(result.status).toBe('PASSED');
    expect(result.assertions[0]).toMatchObject({
      kind: 'http_status_not_5xx',
      passed: true,
    });
  });

  it('returns FAILED when uncaught page error is recorded', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="error-btn" onclick="throw new Error('Synthetic browser error')">Error</button>
        </body>
        </html>
      `);
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'finding-1',
      targetId: 'target-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'click', target: '#error-btn', label: 'Error' }],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    const result = await runner.replay(spec);

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('Synthetic browser error');
    expect(result.assertions[0]).toMatchObject({
      kind: 'absence_of_recorded_browser_error',
      passed: false,
    });
  });

  it('returns FAILED when a 5xx HTTP response is detected', async () => {
    activeServer = await createTestServer((req, res) => {
      if (req.url === '/api/error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="fetch-btn" onclick="fetch('/api/error')">Fetch 500</button>
        </body>
        </html>
      `);
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'finding-1',
      targetId: 'target-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'click', target: '#fetch-btn', label: 'Fetch 500' }],
      assertion: { kind: 'http_status_not_5xx' },
    };

    const result = await runner.replay(spec);

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('500');
    expect(result.assertions[0]).toMatchObject({
      kind: 'http_status_not_5xx',
      passed: false,
    });
  });

  it('returns FAILED when step target cannot be resolved or clicked', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <body>
          <div id="content">No buttons here</div>
        </body>
        </html>
      `);
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 500, // Quick timeout for missing selector
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'finding-1',
      targetId: 'target-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'click', target: '#non-existent-btn', label: 'Missing' }],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    const result = await runner.replay(spec);

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('Step 1 (click) failed');
    expect(result.assertions[0].passed).toBe(false);
  });

  it('never reports PASSED when initial navigation returns HTTP 500', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>500 Internal Error</h1>');
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'finding-1',
      targetId: 'target-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    const result = await runner.replay(spec);

    expect(result.status).toBe('FAILED');
    expect(result.assertions[0].passed).toBe(false);
    expect(result.failureReason).toContain('500');
  });

  it('rejects an invalid specification before launching browser', async () => {
    const runner = new PlaywrightRegressionReplayRunner({ allowLocal: true });

    // Missing version and invalid url
    const invalidSpec = {
      findingId: 'finding-1',
      targetId: 'target-1',
      initialUrl: 'not-a-url',
      createdAt: new Date().toISOString(),
      steps: [],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    } as any;

    await expect(runner.replay(invalidSpec)).rejects.toThrow('Invalid regression specification');
  });

  it('rejects unsupported action types', async () => {
    const runner = new PlaywrightRegressionReplayRunner({ allowLocal: true });

    const specWithUnsupported = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: 'https://example.com/',
      createdAt: new Date().toISOString(),
      steps: [{ type: 'hover' as any, target: 'button', label: 'Hover' }],
      assertion: { kind: 'absence_of_recorded_browser_error' as const },
    } as any;

    await expect(runner.replay(specWithUnsupported)).rejects.toThrow(
      'Invalid regression specification',
    );
  });

  it('rejects specification exceeding 8 steps limit', async () => {
    const runner = new PlaywrightRegressionReplayRunner({ allowLocal: true });

    const specWithNineSteps = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: 'https://example.com/',
      createdAt: new Date().toISOString(),
      steps: Array(9).fill({ type: 'click', target: 'button', label: 'Step' }),
      assertion: { kind: 'absence_of_recorded_browser_error' as const },
    } as any;

    await expect(runner.replay(specWithNineSteps)).rejects.toThrow(
      'Invalid regression specification',
    );
  });

  it('rejects destructive step labels before execution', async () => {
    const runner = new PlaywrightRegressionReplayRunner({ allowLocal: true });

    const destructiveSpec: RegressionSpecification = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: 'https://example.com/',
      createdAt: new Date().toISOString(),
      steps: [{ type: 'click', target: 'button', label: 'Delete account' }],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    await expect(runner.replay(destructiveSpec)).rejects.toThrow(
      'Destructive or unauthorized action label',
    );
  });

  it('rejects clicking DOM element with destructive label or submit type', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="del-btn">Delete all data</button>
        </body>
        </html>
      `);
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'click', target: '#del-btn', label: null }],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    await expect(runner.replay(spec)).rejects.toThrow('matches destructive label');
  });

  it('rejects filling sensitive input types such as password', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <body>
          <input id="pwd-input" type="password" />
        </body>
        </html>
      `);
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'fill', target: '#pwd-input', label: null }],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    await expect(runner.replay(spec)).rejects.toThrow(
      'Filling input of type "password" is prohibited',
    );
  });

  it('blocks navigation to forbidden/private destination in default mode', async () => {
    const runner = new PlaywrightRegressionReplayRunner({
      allowLocal: false, // Strict default
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: 'http://127.0.0.1:9999/',
      createdAt: new Date().toISOString(),
      steps: [],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    await expect(runner.replay(spec)).rejects.toThrow(UnsafeDestinationError);
  });

  it('handles navigation timeout producing a non-passing result', async () => {
    // Server that hangs
    activeServer = await createTestServer((req, res) => {
      // Do not respond
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 200,
      overallTimeoutMs: 1_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    await expect(runner.replay(spec)).rejects.toThrow('Browser navigation timed out');
  });

  it('redacts credentials and bounds error output in failure reason', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="err" onclick="throw new Error('Failed with token=secret-token-123 and authorization: Bearer key999')">Crash</button>
        </body>
        </html>
      `);
    });

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'click', target: '#err', label: 'Crash' }],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    const result = await runner.replay(spec);

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).not.toContain('secret-token-123');
    expect(result.failureReason).not.toContain('key999');
    expect(result.failureReason).toContain('token=[redacted]');
  });

  it('cleans up browser resources after both success and failure', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><h1>Clean</h1></body></html>');
    });

    const launchSpy = vi.spyOn(chromium, 'launch');

    const runner = new PlaywrightRegressionReplayRunner({
      navigationTimeoutMs: 5_000,
      actionTimeoutMs: 2_000,
      allowLocal: true,
    });

    const spec: RegressionSpecification = {
      version: 1,
      findingId: 'f-1',
      targetId: 't-1',
      initialUrl: `${activeServer.url}/`,
      createdAt: new Date().toISOString(),
      steps: [],
      assertion: { kind: 'absence_of_recorded_browser_error' },
    };

    // 1. Success case
    const result = await runner.replay(spec);
    expect(result.status).toBe('PASSED');
    const browserInstance = await launchSpy.mock.results[0].value;
    expect(browserInstance.isConnected()).toBe(false); // Closed!

    // 2. Failure case
    const specFailure: RegressionSpecification = {
      ...spec,
      steps: [{ type: 'click', target: '#does-not-exist', label: 'Fail' }],
    };
    const failResult = await runner.replay(specFailure);
    expect(failResult.status).toBe('FAILED');
    const failBrowserInstance = await launchSpy.mock.results[1].value;
    expect(failBrowserInstance.isConnected()).toBe(false); // Closed!

    launchSpy.mockRestore();
  });
});
