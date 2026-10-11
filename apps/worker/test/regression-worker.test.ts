import http from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { PlaywrightRegressionReplayRunner } from '@realitycheck/playwright-runner';
import {
  NotImplementedRegressionRunner,
  type RegressionReplayRunner,
} from '@realitycheck/regression';
import { createRegressionJobHandler } from '../src/regression-worker.js';

const validSpecification = {
  version: 1 as const,
  findingId: 'finding-1',
  targetId: 'target-1',
  initialUrl: 'https://example.test',
  createdAt: new Date().toISOString(),
  steps: [{ type: 'click' as const, target: 'button', label: 'Submit' }],
  assertion: { kind: 'absence_of_recorded_browser_error' as const },
};

function createMockPrisma(overrides: Record<string, any> = {}) {
  const defaultExecution = {
    id: 'exec-1',
    regressionTestId: 'test-1',
    attemptNumber: 1,
    status: 'QUEUED',
    startedAt: null,
    completedAt: null,
    failureReason: null,
    message: null,
    test: {
      id: 'test-1',
      specification: validSpecification,
    },
  };

  return {
    regressionExecution: {
      findUnique: vi.fn().mockResolvedValue(defaultExecution),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ ...defaultExecution, status: 'RUNNING' }),
      ...overrides,
    },
  };
}

describe('createRegressionJobHandler', () => {
  it('rejects invalid job payload at the worker boundary', async () => {
    const handler = createRegressionJobHandler({
      prisma: createMockPrisma() as any,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await expect(handler({ data: {} })).rejects.toThrow('Invalid regression job payload');
    await expect(
      handler({ data: { regressionTestId: 'test-1', executionId: '' } }),
    ).rejects.toThrow('Invalid regression job payload');
  });

  it('safely claims and transitions a queued attempt to RUNNING', async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = createMockPrisma({
      updateMany: updateManyMock,
      update: updateMock,
    });

    const mockRunner: RegressionReplayRunner = {
      replay: vi.fn().mockResolvedValue({
        status: 'PASSED',
        assertions: [{ kind: 'absence_of_recorded_browser_error', passed: true }],
      }),
    };

    const handler = createRegressionJobHandler({
      prisma: prisma as any,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      runner: mockRunner,
    });

    await handler({ data: { regressionTestId: 'test-1', executionId: 'exec-1' } });

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'exec-1', status: 'QUEUED' },
      data: expect.objectContaining({ status: 'RUNNING' }),
    });
    expect(mockRunner.replay).toHaveBeenCalledWith(validSpecification);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        status: 'PASSED',
        failureReason: null,
      }),
    });
  });

  it('safely skips already-claimed or terminal attempts under duplicate delivery', async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 0 }); // Already claimed!
    const prisma = createMockPrisma({ updateMany: updateManyMock });

    const mockRunner: RegressionReplayRunner = {
      replay: vi.fn(),
    };

    const handler = createRegressionJobHandler({
      prisma: prisma as any,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      runner: mockRunner,
    });

    await handler({ data: { regressionTestId: 'test-1', executionId: 'exec-1' } });

    expect(updateManyMock).toHaveBeenCalled();
    expect(mockRunner.replay).not.toHaveBeenCalled();
  });

  it('validates the specification before execution and transitions to ERROR if invalid', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = createMockPrisma({
      findUnique: vi.fn().mockResolvedValue({
        id: 'exec-1',
        regressionTestId: 'test-1',
        status: 'QUEUED',
        test: {
          id: 'test-1',
          specification: { invalid: 'not a valid spec' },
        },
      }),
      update: updateMock,
    });

    const mockRunner: RegressionReplayRunner = { replay: vi.fn() };
    const handler = createRegressionJobHandler({
      prisma: prisma as any,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      runner: mockRunner,
    });

    await handler({ data: { regressionTestId: 'test-1', executionId: 'exec-1' } });

    expect(mockRunner.replay).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        status: 'ERROR',
        message: 'Specification validation failed',
      }),
    });
  });

  it('persists FAILED status and sanitized reason when assertions fail', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = createMockPrisma({ update: updateMock });

    const mockRunner: RegressionReplayRunner = {
      replay: vi.fn().mockResolvedValue({
        status: 'FAILED',
        assertions: [{ kind: 'absence_of_recorded_browser_error', passed: false }],
        failureReason: 'Found uncaught page error: token=secret-pass',
      }),
    };

    const handler = createRegressionJobHandler({
      prisma: prisma as any,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      runner: mockRunner,
    });

    await handler({ data: { regressionTestId: 'test-1', executionId: 'exec-1' } });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        failureReason: expect.not.stringContaining('secret-pass'),
      }),
    });
  });

  it('persists ERROR status and sanitized reason when replay throws unexpected error', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = createMockPrisma({ update: updateMock });

    const mockRunner: RegressionReplayRunner = {
      replay: vi.fn().mockRejectedValue(new Error('Browser crashed authorization: Bearer key123')),
    };

    const handler = createRegressionJobHandler({
      prisma: prisma as any,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      runner: mockRunner,
    });

    await handler({ data: { regressionTestId: 'test-1', executionId: 'exec-1' } });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        status: 'ERROR',
        failureReason: expect.not.stringContaining('key123'),
      }),
    });
  });

  it('transitions to ERROR when explicit NotImplementedRegressionRunner is used', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = createMockPrisma({ update: updateMock });

    const handler = createRegressionJobHandler({
      prisma: prisma as any,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      runner: new NotImplementedRegressionRunner(),
    });

    await handler({ data: { regressionTestId: 'test-1', executionId: 'exec-1' } });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        status: 'ERROR',
        failureReason: 'Regression replay is not yet implemented (Phase 2)',
      }),
    });
  });

  it('runs real Playwright execution and persists PASSED status with assertion results', async () => {
    let server: http.Server | undefined;
    const serverUrl = await new Promise<string>((resolve) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body><h1>Safe worker test page</h1></body></html>');
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address() as any;
        resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const updateMock = vi.fn().mockResolvedValue({});
      const spec = {
        version: 1 as const,
        findingId: 'finding-1',
        targetId: 'target-1',
        initialUrl: serverUrl,
        createdAt: new Date().toISOString(),
        steps: [],
        assertion: { kind: 'absence_of_recorded_browser_error' as const },
      };
      const prisma = createMockPrisma({
        findUnique: vi.fn().mockResolvedValue({
          id: 'exec-1',
          regressionTestId: 'test-1',
          status: 'QUEUED',
          test: { id: 'test-1', specification: spec },
        }),
        update: updateMock,
      });

      const realRunner = new PlaywrightRegressionReplayRunner({
        navigationTimeoutMs: 5_000,
        actionTimeoutMs: 2_000,
        allowLocal: true,
      });

      const handler = createRegressionJobHandler({
        prisma: prisma as any,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        runner: realRunner,
      });

      await handler({ data: { regressionTestId: 'test-1', executionId: 'exec-1' } });

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'PASSED',
          failureReason: null,
          assertions: [
            expect.objectContaining({
              kind: 'absence_of_recorded_browser_error',
              passed: true,
            }),
          ],
        }),
      });
    } finally {
      if (server) {
        await new Promise((res) => server!.close(res));
      }
    }
  });

  it('runs real Playwright execution and persists FAILED status when assertions fail', async () => {
    let server: http.Server | undefined;
    const serverUrl = await new Promise<string>((resolve) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<!DOCTYPE html><html><body><script>throw new Error("Worker test unhandled crash");</script></body></html>',
        );
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address() as any;
        resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const updateMock = vi.fn().mockResolvedValue({});
      const spec = {
        version: 1 as const,
        findingId: 'finding-1',
        targetId: 'target-1',
        initialUrl: serverUrl,
        createdAt: new Date().toISOString(),
        steps: [],
        assertion: { kind: 'absence_of_recorded_browser_error' as const },
      };
      const prisma = createMockPrisma({
        findUnique: vi.fn().mockResolvedValue({
          id: 'exec-1',
          regressionTestId: 'test-1',
          status: 'QUEUED',
          test: { id: 'test-1', specification: spec },
        }),
        update: updateMock,
      });

      const realRunner = new PlaywrightRegressionReplayRunner({
        navigationTimeoutMs: 5_000,
        actionTimeoutMs: 2_000,
        allowLocal: true,
      });

      const handler = createRegressionJobHandler({
        prisma: prisma as any,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        runner: realRunner,
      });

      await handler({ data: { regressionTestId: 'test-1', executionId: 'exec-1' } });

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: expect.stringContaining('Worker test unhandled crash'),
          assertions: [
            expect.objectContaining({
              kind: 'absence_of_recorded_browser_error',
              passed: false,
            }),
          ],
        }),
      });
    } finally {
      if (server) {
        await new Promise((res) => server!.close(res));
      }
    }
  });
});
