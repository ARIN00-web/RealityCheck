export type RegressionExecutionLike = {
  id?: string;
  attemptNumber: number;
  status: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR';
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  failureReason?: string | null;
  assertions?: Array<{
    kind: string;
    passed: boolean;
    actual?: unknown;
    expected?: unknown;
    message?: string | null;
  }> | null;
};

export type AssertionComparisonItem = {
  kind: string;
  previousPassed: boolean | null;
  currentPassed: boolean;
  status: 'PASSED' | 'FAILED' | 'RECOVERED' | 'REGRESSED' | 'UNCHANGED';
  message?: string | null;
};

export type ExecutionComparisonResult = {
  status: 'NO_PREDECESSOR' | 'INCONCLUSIVE' | 'REGRESSED' | 'RECOVERED' | 'UNCHANGED';
  previousAttemptNumber: number | null;
  currentAttemptNumber: number;
  previousStatus: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR' | null;
  currentStatus: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR';
  headline: string;
  reason: string | null;
  assertions: AssertionComparisonItem[];
};

export function compareExecutionAttempts(
  current: RegressionExecutionLike,
  previous?: RegressionExecutionLike | null,
): ExecutionComparisonResult {
  if (!previous) {
    const assertions = normalizeAssertions(current.assertions).map((a) => ({
      kind: a.kind,
      previousPassed: null,
      currentPassed: a.passed,
      status: (a.passed ? 'PASSED' : 'FAILED') as 'PASSED' | 'FAILED',
      message: a.message ?? null,
    }));
    return {
      status: 'NO_PREDECESSOR',
      previousAttemptNumber: null,
      currentAttemptNumber: current.attemptNumber,
      previousStatus: null,
      currentStatus: current.status,
      headline: `Baseline execution (attempt #${current.attemptNumber})`,
      reason: 'No previous execution attempt exists for comparison.',
      assertions,
    };
  }

  if (
    ['QUEUED', 'RUNNING'].includes(current.status) ||
    ['QUEUED', 'RUNNING'].includes(previous.status)
  ) {
    return {
      status: 'INCONCLUSIVE',
      previousAttemptNumber: previous.attemptNumber,
      currentAttemptNumber: current.attemptNumber,
      previousStatus: previous.status,
      currentStatus: current.status,
      headline: 'Comparison inconclusive: execution attempt is still active',
      reason: 'One or more execution attempts are still queued or running.',
      assertions: [],
    };
  }

  if (current.status === 'ERROR' || previous.status === 'ERROR') {
    const errorDetails =
      current.status === 'ERROR'
        ? `Attempt #${current.attemptNumber} encountered an execution error: ${current.failureReason ?? 'Unknown error'}`
        : `Previous attempt #${previous.attemptNumber} encountered an execution error: ${previous.failureReason ?? 'Unknown error'}`;
    return {
      status: 'INCONCLUSIVE',
      previousAttemptNumber: previous.attemptNumber,
      currentAttemptNumber: current.attemptNumber,
      previousStatus: previous.status,
      currentStatus: current.status,
      headline: 'Comparison inconclusive: execution error encountered',
      reason: errorDetails,
      assertions: [],
    };
  }

  const currentAssertions = normalizeAssertions(current.assertions);
  const previousAssertions = normalizeAssertions(previous.assertions);

  if (currentAssertions.length === 0 || previousAssertions.length === 0) {
    return {
      status: 'INCONCLUSIVE',
      previousAttemptNumber: previous.attemptNumber,
      currentAttemptNumber: current.attemptNumber,
      previousStatus: previous.status,
      currentStatus: current.status,
      headline: 'Comparison inconclusive: missing assertion details',
      reason: 'Sufficient assertion results were not recorded to compare outcomes reliably.',
      assertions: [],
    };
  }

  const comparedAssertions: AssertionComparisonItem[] = [];
  const prevMap = new Map<string, boolean>();
  for (const prev of previousAssertions) {
    prevMap.set(prev.kind, prev.passed);
  }

  for (const curr of currentAssertions) {
    const prevPassed = prevMap.has(curr.kind) ? prevMap.get(curr.kind)! : null;
    let itemStatus: AssertionComparisonItem['status'];
    if (prevPassed === null) {
      itemStatus = curr.passed ? 'PASSED' : 'FAILED';
    } else if (!prevPassed && curr.passed) {
      itemStatus = 'RECOVERED';
    } else if (prevPassed && !curr.passed) {
      itemStatus = 'REGRESSED';
    } else {
      itemStatus = 'UNCHANGED';
    }

    comparedAssertions.push({
      kind: curr.kind,
      previousPassed: prevPassed,
      currentPassed: curr.passed,
      status: itemStatus,
      message: curr.message ?? null,
    });
  }

  let status: ExecutionComparisonResult['status'];
  let headline: string;
  let reason: string | null = null;

  if (previous.status === 'FAILED' && current.status === 'PASSED') {
    status = 'RECOVERED';
    headline = `Recovered: attempt #${current.attemptNumber} passed (previously failed on attempt #${previous.attemptNumber})`;
    reason = 'All required assertions passed after previously failing.';
  } else if (previous.status === 'PASSED' && current.status === 'FAILED') {
    status = 'REGRESSED';
    headline = `Regressed: attempt #${current.attemptNumber} failed (previously passed on attempt #${previous.attemptNumber})`;
    reason = current.failureReason ?? 'One or more assertions failed after previously passing.';
  } else if (previous.status === 'PASSED' && current.status === 'PASSED') {
    status = 'UNCHANGED';
    headline = `Unchanged: attempt #${current.attemptNumber} remains passing`;
    reason = `Assertions continue to pass as in attempt #${previous.attemptNumber}.`;
  } else {
    status = 'UNCHANGED';
    headline = `Unchanged: attempt #${current.attemptNumber} remains failing`;
    reason = current.failureReason ?? `Failure persists as in attempt #${previous.attemptNumber}.`;
  }

  return {
    status,
    previousAttemptNumber: previous.attemptNumber,
    currentAttemptNumber: current.attemptNumber,
    previousStatus: previous.status,
    currentStatus: current.status,
    headline,
    reason,
    assertions: comparedAssertions,
  };
}

function normalizeAssertions(
  assertions: unknown,
): Array<{ kind: string; passed: boolean; message?: string | null }> {
  if (!Array.isArray(assertions)) return [];
  return assertions.filter(
    (item): item is { kind: string; passed: boolean; message?: string | null } =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as any).kind === 'string' &&
      typeof (item as any).passed === 'boolean',
  );
}
