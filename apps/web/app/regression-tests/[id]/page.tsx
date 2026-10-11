'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  comparisonBadgeClass,
  formatDate,
  type DashboardExecutionComparison,
  type DashboardRegressionExecution,
  type DashboardRegressionTest,
} from '../../dashboard-utils';

export default function RegressionTestDetailPage() {
  const params = useParams<{ id: string }>();
  const [test, setTest] = useState<DashboardRegressionTest | null>(null);
  const [executions, setExecutions] = useState<DashboardRegressionExecution[]>([]);
  const [comparison, setComparison] = useState<DashboardExecutionComparison | null>(null);
  const [message, setMessage] = useState('Loading regression test details…');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const [testRes, execsRes] = await Promise.all([
        fetch(`/api/regression-tests/${params.id}`),
        fetch(`/api/regression-tests/${params.id}/executions`),
      ]);

      if (testRes.status === 404) {
        setMessage('This regression test no longer exists.');
        return;
      }
      if (!testRes.ok) {
        throw new Error('Unable to load regression test details.');
      }

      const testData = (await testRes.json()) as DashboardRegressionTest;
      setTest(testData);

      if (execsRes.ok) {
        const execsData = (await execsRes.json()) as DashboardRegressionExecution[];
        setExecutions(execsData);

        if (execsData.length > 0) {
          const compRes = await fetch(`/api/regression-tests/${params.id}/comparison`);
          if (compRes.ok) {
            setComparison(await compRes.json());
          } else {
            setComparison(null);
          }
        } else {
          setComparison(null);
        }
      }
      setMessage('');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to load regression test details.',
      );
    }
  }, [params.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const hasActiveExecution = executions.some(
    (exec) => exec.status === 'QUEUED' || exec.status === 'RUNNING',
  );

  useEffect(() => {
    if (!hasActiveExecution) return;
    const timeout = window.setTimeout(() => void loadData(), 3_000);
    return () => window.clearTimeout(timeout);
  }, [hasActiveExecution, loadData]);

  async function triggerRun(): Promise<void> {
    setStarting(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/regression-tests/${params.id}/executions`, {
        method: 'POST',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message ?? 'Unable to trigger regression execution.');
      }
      setFeedback('Regression test execution queued. Live updates will follow.');
      await loadData();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Unable to trigger regression execution.',
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="dashboard-shell detail-shell">
      <a
        className="back-link"
        href={`/targets/${test ? ((test.specification as any).targetId ?? '') : ''}`}
      >
        ← Target history
      </a>

      {test ? (
        <section className="detail-card">
          <p className="eyebrow">Regression test</p>
          <h1>{test.name}</h1>
          <p className="url">{test.specification.initialUrl}</p>
          <p className="muted">
            Created on {formatDate(test.createdAt)} · {test.specification.steps.length}{' '}
            deterministic step{test.specification.steps.length === 1 ? '' : 's'}
          </p>

          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button type="button" onClick={triggerRun} disabled={starting || hasActiveExecution}>
              {starting
                ? 'Queueing…'
                : hasActiveExecution
                  ? 'Execution in progress…'
                  : executions.length === 0
                    ? 'Run test'
                    : 'Rerun test'}
            </button>
          </div>

          {feedback ? (
            <p
              className={`feedback ${feedback.includes('Unable') || feedback.includes('already') ? 'error' : 'success'}`}
              role="status"
            >
              {feedback}
            </p>
          ) : null}

          {/* Attempt comparison panel */}
          {comparison ? (
            <section className="comparison-card" aria-labelledby="comparison-heading">
              <div className="comparison-header">
                <span className={comparisonBadgeClass(comparison.status)}>
                  {comparison.status.replaceAll('_', ' ')}
                </span>
                <span className="muted">
                  Attempt #{comparison.currentAttemptNumber}
                  {comparison.previousAttemptNumber
                    ? ` vs Attempt #${comparison.previousAttemptNumber}`
                    : ' (Baseline)'}
                </span>
              </div>
              <h2 id="comparison-heading" style={{ fontSize: '1.2rem', marginBottom: '8px' }}>
                {comparison.headline}
              </h2>
              {comparison.reason ? <p className="muted">{comparison.reason}</p> : null}

              {comparison.assertions.length > 0 ? (
                <div style={{ marginTop: '14px' }}>
                  <p className="section-kicker">Assertion outcomes</p>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'grid',
                      gap: '8px',
                    }}
                  >
                    {comparison.assertions.map((a, i) => (
                      <li
                        key={`${a.kind}-${i}`}
                        style={{
                          padding: '8px 12px',
                          background: '#091525',
                          borderRadius: '8px',
                          border: '1px solid #243a51',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong>{a.kind}</strong>
                          {a.message ? (
                            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                              {a.message}
                            </p>
                          ) : null}
                        </div>
                        <span className={comparisonBadgeClass(a.status)}>{a.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Stored specification details */}
          <details className="action-journey" style={{ marginTop: '24px' }}>
            <summary>
              Stored specification (version {test.specification.version}) ·{' '}
              {test.specification.assertion.kind}
            </summary>
            <div style={{ marginTop: '12px' }}>
              <p className="muted">
                Initial URL: <code>{test.specification.initialUrl}</code>
              </p>
              <p className="muted">
                Assertion kind: <code>{test.specification.assertion.kind}</code>
              </p>
              {test.specification.steps.length === 0 ? (
                <p className="muted">
                  No intermediate steps; validates initial page load directly.
                </p>
              ) : (
                <ol className="action-list">
                  {test.specification.steps.map((step, idx) => (
                    <li key={`${step.type}-${idx}`}>
                      <strong>
                        #{idx + 1} · {step.type}
                      </strong>
                      <p className="muted">Target: {step.target}</p>
                      {step.label ? <p>Label: {step.label}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>

          {/* Execution history */}
          <section className="regression-section">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Audit trail</p>
                <h2>Execution attempts</h2>
              </div>
              <span className="count">{executions.length}</span>
            </div>

            {executions.length === 0 ? (
              <div className="empty-state">
                <p>No execution attempts have been run for this test yet.</p>
              </div>
            ) : (
              <ol className="run-list detail-runs">
                {executions.map((exec) => (
                  <li key={exec.id} style={{ display: 'block' }}>
                    <div className="item-card">
                      <div className="item-card-header">
                        <div>
                          <strong>Attempt #{exec.attemptNumber}</strong>
                          <time>{formatDate(exec.createdAt)}</time>
                        </div>
                        <span className={`run-status ${exec.status.toLowerCase()}`}>
                          {exec.status.replaceAll('_', ' ')}
                        </span>
                      </div>

                      {exec.failureReason ? (
                        <p className="feedback error" style={{ margin: '8px 0' }}>
                          {exec.failureReason}
                        </p>
                      ) : null}

                      {exec.assertions && exec.assertions.length > 0 ? (
                        <div style={{ marginTop: '10px' }}>
                          <p className="section-kicker" style={{ fontSize: '0.7rem' }}>
                            Assertions ({exec.assertions.length})
                          </p>
                          <ul
                            style={{
                              listStyle: 'none',
                              padding: 0,
                              margin: 0,
                              display: 'grid',
                              gap: '6px',
                            }}
                          >
                            {exec.assertions.map((a, i) => (
                              <li
                                key={`${a.kind}-${i}`}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  background: '#0d1a2b',
                                  fontSize: '0.85rem',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span>{a.kind}</span>
                                <span
                                  style={{
                                    color: a.passed ? '#b6f6d8' : '#ffb4bf',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {a.passed ? 'PASSED' : 'FAILED'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>
      ) : (
        <p className="feedback error" role="alert">
          {message}
        </p>
      )}
    </main>
  );
}
