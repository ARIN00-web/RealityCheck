export type DashboardTarget = {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
};

export type DashboardRun = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  target: { id: string; url: string };
};

export function targetLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function targetsEmptyCopy(targetCount: number): string {
  return targetCount === 0
    ? 'Add your first website to begin building a reliable QA history.'
    : 'No recent runs have been recorded for these targets.';
}

export type DashboardRegressionTest = {
  id: string;
  findingId: string;
  name: string;
  createdAt: string;
  specification: {
    version: number;
    initialUrl: string;
    targetId?: string;
    steps: Array<{ type: string; target: string; label: string | null }>;
    assertion: { kind: string };
  };
};

export type DashboardRegressionFinding = {
  findingId: string;
  title: string;
  eligible: boolean;
  reason: string | null;
};

export type DashboardRegressionExecution = {
  id: string;
  regressionTestId: string;
  attemptNumber: number;
  status: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR';
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  message?: string | null;
  assertions?: Array<{
    kind: string;
    passed: boolean;
    actual?: unknown;
    expected?: unknown;
    message?: string | null;
  }> | null;
  createdAt: string;
};

export type DashboardExecutionComparison = {
  status: 'NO_PREDECESSOR' | 'INCONCLUSIVE' | 'REGRESSED' | 'RECOVERED' | 'UNCHANGED';
  previousAttemptNumber: number | null;
  currentAttemptNumber: number;
  previousStatus: string | null;
  currentStatus: string;
  headline: string;
  reason: string | null;
  assertions: Array<{
    kind: string;
    previousPassed: boolean | null;
    currentPassed: boolean;
    status: 'PASSED' | 'FAILED' | 'RECOVERED' | 'REGRESSED' | 'UNCHANGED';
    message?: string | null;
  }>;
};

export function comparisonBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case 'RECOVERED':
      return 'comparison-status recovered';
    case 'REGRESSED':
      return 'comparison-status regressed';
    case 'UNCHANGED':
      return 'comparison-status unchanged';
    case 'INCONCLUSIVE':
      return 'comparison-status inconclusive';
    default:
      return 'comparison-status baseline';
  }
}
