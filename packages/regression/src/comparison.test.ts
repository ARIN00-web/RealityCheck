import { describe, expect, it } from 'vitest';
import { compareExecutionAttempts, type RegressionExecutionLike } from './comparison.js';

describe('compareExecutionAttempts', () => {
  it('identifies baseline execution when there is no predecessor', () => {
    const current: RegressionExecutionLike = {
      attemptNumber: 1,
      status: 'PASSED',
      assertions: [{ kind: 'absence_of_recorded_browser_error', passed: true }],
    };

    const result = compareExecutionAttempts(current);

    expect(result).toMatchObject({
      status: 'NO_PREDECESSOR',
      currentAttemptNumber: 1,
      previousAttemptNumber: null,
      previousStatus: null,
      currentStatus: 'PASSED',
    });
    expect(result.assertions).toEqual([
      {
        kind: 'absence_of_recorded_browser_error',
        currentPassed: true,
        previousPassed: null,
        status: 'PASSED',
        message: null,
      },
    ]);
  });

  it('marks comparison inconclusive when current attempt is still active (QUEUED or RUNNING)', () => {
    const previous: RegressionExecutionLike = {
      attemptNumber: 1,
      status: 'FAILED',
      assertions: [{ kind: 'absence_of_recorded_browser_error', passed: false }],
    };
    const current: RegressionExecutionLike = {
      attemptNumber: 2,
      status: 'RUNNING',
      assertions: null,
    };

    const result = compareExecutionAttempts(current, previous);

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.headline).toContain('active');
  });

  it('marks comparison inconclusive when predecessor is still active', () => {
    const previous: RegressionExecutionLike = {
      attemptNumber: 1,
      status: 'QUEUED',
      assertions: null,
    };
    const current: RegressionExecutionLike = {
      attemptNumber: 2,
      status: 'PASSED',
      assertions: [{ kind: 'absence_of_recorded_browser_error', passed: true }],
    };

    const result = compareExecutionAttempts(current, previous);

    expect(result.status).toBe('INCONCLUSIVE');
  });

  it('marks comparison inconclusive when an attempt encountered an execution ERROR', () => {
    const previous: RegressionExecutionLike = {
      attemptNumber: 1,
      status: 'FAILED',
      assertions: [{ kind: 'absence_of_recorded_browser_error', passed: false }],
    };
    const current: RegressionExecutionLike = {
      attemptNumber: 2,
      status: 'ERROR',
      failureReason: 'Browser crashed unexpectedly',
      assertions: null,
    };

    const result = compareExecutionAttempts(current, previous);

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.reason).toContain('Browser crashed unexpectedly');
  });

  it('detects a recovery when previous attempt was FAILED and current is PASSED', () => {
    const previous: RegressionExecutionLike = {
      attemptNumber: 1,
      status: 'FAILED',
      failureReason: 'Uncaught TypeError in console',
      assertions: [
        {
          kind: 'absence_of_recorded_browser_error',
          passed: false,
          message: 'Uncaught TypeError',
        },
      ],
    };
    const current: RegressionExecutionLike = {
      attemptNumber: 2,
      status: 'PASSED',
      assertions: [
        {
          kind: 'absence_of_recorded_browser_error',
          passed: true,
          message: 'No errors',
        },
      ],
    };

    const result = compareExecutionAttempts(current, previous);

    expect(result.status).toBe('RECOVERED');
    expect(result.previousAttemptNumber).toBe(1);
    expect(result.currentAttemptNumber).toBe(2);
    expect(result.headline).toContain('Recovered');
    expect(result.assertions).toEqual([
      {
        kind: 'absence_of_recorded_browser_error',
        previousPassed: false,
        currentPassed: true,
        status: 'RECOVERED',
        message: 'No errors',
      },
    ]);
  });

  it('detects a regression when previous attempt was PASSED and current is FAILED', () => {
    const previous: RegressionExecutionLike = {
      attemptNumber: 2,
      status: 'PASSED',
      assertions: [
        {
          kind: 'http_status_not_5xx',
          passed: true,
        },
      ],
    };
    const current: RegressionExecutionLike = {
      attemptNumber: 3,
      status: 'FAILED',
      failureReason: '5xx HTTP response recorded: 500',
      assertions: [
        {
          kind: 'http_status_not_5xx',
          passed: false,
          message: '500 Internal Server Error',
        },
      ],
    };

    const result = compareExecutionAttempts(current, previous);

    expect(result.status).toBe('REGRESSED');
    expect(result.headline).toContain('Regressed');
    expect(result.reason).toContain('5xx HTTP response recorded: 500');
    expect(result.assertions).toEqual([
      {
        kind: 'http_status_not_5xx',
        previousPassed: true,
        currentPassed: false,
        status: 'REGRESSED',
        message: '500 Internal Server Error',
      },
    ]);
  });

  it('detects UNCHANGED status when both attempts passed', () => {
    const previous: RegressionExecutionLike = {
      attemptNumber: 1,
      status: 'PASSED',
      assertions: [{ kind: 'absence_of_recorded_browser_error', passed: true }],
    };
    const current: RegressionExecutionLike = {
      attemptNumber: 2,
      status: 'PASSED',
      assertions: [{ kind: 'absence_of_recorded_browser_error', passed: true }],
    };

    const result = compareExecutionAttempts(current, previous);

    expect(result.status).toBe('UNCHANGED');
    expect(result.headline).toContain('remains passing');
    expect(result.assertions[0].status).toBe('UNCHANGED');
  });

  it('detects UNCHANGED status when both attempts failed', () => {
    const previous: RegressionExecutionLike = {
      attemptNumber: 1,
      status: 'FAILED',
      failureReason: 'Crash on button click',
      assertions: [{ kind: 'absence_of_recorded_browser_error', passed: false }],
    };
    const current: RegressionExecutionLike = {
      attemptNumber: 2,
      status: 'FAILED',
      failureReason: 'Crash on button click persists',
      assertions: [{ kind: 'absence_of_recorded_browser_error', passed: false }],
    };

    const result = compareExecutionAttempts(current, previous);

    expect(result.status).toBe('UNCHANGED');
    expect(result.headline).toContain('remains failing');
    expect(result.assertions[0].status).toBe('UNCHANGED');
  });

  it('marks comparison inconclusive without sufficient assertion evidence', () => {
    const previous: RegressionExecutionLike = {
      attemptNumber: 1,
      status: 'PASSED',
      assertions: [],
    };
    const current: RegressionExecutionLike = {
      attemptNumber: 2,
      status: 'PASSED',
      assertions: null,
    };

    const result = compareExecutionAttempts(current, previous);

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.headline).toContain('missing assertion details');
  });
});
