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
import { Sidebar } from '../../components/Sidebar';
import { Topbar } from '../../components/Topbar';
import { BrowserMockup } from '../../components/BrowserMockup';

export default function RegressionTestDetailPage() {
  const params = useParams<{ id: string }>();
  const [test, setTest] = useState<DashboardRegressionTest | null>(null);
  const [executions, setExecutions] = useState<DashboardRegressionExecution[]>([]);
  const [comparison, setComparison] = useState<DashboardExecutionComparison | null>(null);
  const [message, setMessage] = useState('Loading regression test details…');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const passedExecutionsCount = executions.filter((e) => e.status === 'PASSED').length;
  const failedExecutionsCount = executions.filter(
    (e) => e.status === 'FAILED' || e.status === 'ERROR',
  ).length;
  const latestExecution = executions[0] ?? null;

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="page-container" style={{ maxWidth: '1280px' }}>
          <a
            href={test?.specification.targetId ? `/targets/${test.specification.targetId}` : '/'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--pink-hot)',
              fontWeight: 700,
              fontSize: '0.9rem',
              marginBottom: '20px',
            }}
          >
            ← Back to Target
          </a>

          {test ? (
            <div>
              {/* Header Card (Screen 08) */}
              <div className="glass-panel">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '20px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        className="section-kicker"
                        style={{ color: 'var(--pink-hot)', margin: 0 }}
                      >
                        Regression Test #{test.id.slice(-6)}
                      </span>
                      {latestExecution ? (
                        <span className={`status-pill ${latestExecution.status.toLowerCase()}`}>
                          {latestExecution.status}
                        </span>
                      ) : null}
                    </div>

                    <h1
                      style={{
                        fontSize: '2.1rem',
                        fontWeight: 900,
                        color: '#fff',
                        margin: '4px 0 8px',
                      }}
                    >
                      {test.name}
                    </h1>

                    <p
                      style={{
                        color: 'var(--lavender-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.86rem',
                        margin: '0 0 12px',
                      }}
                    >
                      {test.specification.initialUrl}
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        gap: '14px',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>Created {formatDate(test.createdAt)}</span>
                      <span>·</span>
                      <span>{test.specification.steps.length} deterministic steps</span>
                      <span>·</span>
                      <span>Assertion: {test.specification.assertion.kind}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={triggerRun}
                      disabled={starting || hasActiveExecution}
                    >
                      <svg
                        width="18"
                        height="18"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span>
                        {starting
                          ? 'Queueing…'
                          : hasActiveExecution
                            ? 'Execution in progress…'
                            : executions.length === 0
                              ? 'Run test'
                              : 'Rerun test'}
                      </span>
                    </button>
                  </div>
                </div>

                {feedback ? (
                  <div
                    className={`feedback-box ${feedback.includes('Unable') || feedback.includes('already') ? 'error' : 'success'}`}
                    style={{ marginTop: '20px', marginBottom: 0 }}
                    role="status"
                  >
                    <span>{feedback}</span>
                  </div>
                ) : null}
              </div>

              {/* Stats Summary Strip (Screen 08) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px',
                  marginBottom: '28px',
                }}
              >
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <span className="stat-label">Executions</span>
                  <div className="stat-value" style={{ fontSize: '1.8rem' }}>
                    {executions.length}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <span className="stat-label">Passed</span>
                  <div className="stat-value" style={{ fontSize: '1.8rem', color: '#34d399' }}>
                    {passedExecutionsCount}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <span className="stat-label">Failed</span>
                  <div className="stat-value" style={{ fontSize: '1.8rem', color: '#fb7185' }}>
                    {failedExecutionsCount}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <span className="stat-label">Avg Duration</span>
                  <div
                    className="stat-value"
                    style={{ fontSize: '1.8rem', color: 'var(--cyan-accent)' }}
                  >
                    ~2.1s
                  </div>
                </div>
              </div>

              {/* Comparison Card (Screen 10) */}
              {comparison ? (
                <section className="comparison-aura-card" aria-labelledby="comparison-heading">
                  <div className="comparison-layout">
                    <div>
                      <div className="comparison-attempts-row">
                        <div className="attempt-pill">
                          <strong>Attempt #{comparison.currentAttemptNumber} (Latest)</strong>
                          <span>{comparison.currentStatus}</span>
                        </div>
                        {comparison.previousAttemptNumber ? (
                          <>
                            <span style={{ color: 'var(--magenta-bright)', fontWeight: 800 }}>
                              vs
                            </span>
                            <div className="attempt-pill">
                              <strong>
                                Attempt #{comparison.previousAttemptNumber} (Previous)
                              </strong>
                              <span>{comparison.previousStatus}</span>
                            </div>
                          </>
                        ) : (
                          <span className="comparison-status baseline">Baseline Attempt</span>
                        )}
                      </div>

                      <h2
                        id="comparison-heading"
                        style={{
                          fontSize: '1.45rem',
                          fontWeight: 800,
                          color: '#fff',
                          marginBottom: '8px',
                        }}
                      >
                        {comparison.headline}
                      </h2>
                      {comparison.reason ? (
                        <p
                          style={{
                            color: 'var(--lavender-muted)',
                            fontSize: '0.92rem',
                            margin: '0 0 16px',
                          }}
                        >
                          {comparison.reason}
                        </p>
                      ) : null}

                      {/* Assertion Outcomes Table */}
                      {comparison.assertions.length > 0 ? (
                        <div>
                          <span
                            className="section-kicker"
                            style={{ color: 'var(--magenta-bright)' }}
                          >
                            Assertion Results
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              marginTop: '8px',
                            }}
                          >
                            {comparison.assertions.map((a, i) => (
                              <div
                                key={`${a.kind}-${i}`}
                                style={{
                                  padding: '10px 14px',
                                  background: 'rgba(24, 9, 42, 0.75)',
                                  border: 'var(--border-glass)',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div>
                                  <strong style={{ fontSize: '0.92rem', color: '#fff' }}>
                                    {a.kind}
                                  </strong>
                                  {a.message ? (
                                    <p
                                      style={{
                                        margin: '2px 0 0',
                                        fontSize: '0.8rem',
                                        color: 'var(--lavender-muted)',
                                      }}
                                    >
                                      {a.message}
                                    </p>
                                  ) : null}
                                </div>
                                <span className={comparisonBadgeClass(a.status)}>{a.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Circular Aura Verdict (Screen 10) */}
                    <div>
                      <div className="aura-verdict-circle">
                        <div>
                          <div className="aura-verdict-title">
                            {comparison.status.replaceAll('_', ' ')}
                          </div>
                          <div className="aura-verdict-subtitle">
                            {comparison.status === 'UNCHANGED'
                              ? 'Identical Results'
                              : comparison.status === 'RECOVERED'
                                ? 'Defect Resolved'
                                : comparison.status === 'REGRESSED'
                                  ? 'Regression Detected'
                                  : 'Baseline Established'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {/* Two Column Section: Browser Replay Mockup (Screen 09) + Stored Specification */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '24px',
                  marginBottom: '28px',
                }}
              >
                {/* Screen 09: Browser Replay Frame */}
                <div className="glass-panel" style={{ margin: 0 }}>
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">Deterministic Replay Steps</h3>
                      <p className="panel-subtitle">Chromium headless interaction replay</p>
                    </div>
                  </div>

                  <BrowserMockup url={test.specification.initialUrl} height={220}>
                    <div style={{ width: '100%' }}>
                      <div className="steps-timeline">
                        {test.specification.steps.map((step, idx) => (
                          <div key={idx} className="timeline-step">
                            <div className="step-info">
                              <div className="step-badge">{idx + 1}</div>
                              <div>
                                <strong
                                  style={{
                                    color: '#fff',
                                    fontSize: '0.9rem',
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {step.type}
                                </strong>
                                {step.label ? (
                                  <p
                                    style={{
                                      margin: '2px 0 0',
                                      fontSize: '0.82rem',
                                      color: 'var(--lavender-mid)',
                                    }}
                                  >
                                    {step.label}
                                  </p>
                                ) : null}
                                <span
                                  style={{
                                    fontSize: '0.74rem',
                                    color: 'var(--text-dim)',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  {step.target}
                                </span>
                              </div>
                            </div>
                            <span className="duration-tag">✓ Ready</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </BrowserMockup>
                </div>

                {/* Stored Specification Card */}
                <div className="glass-panel" style={{ margin: 0 }}>
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">
                        Stored Specification (v{test.specification.version})
                      </h3>
                      <p className="panel-subtitle">Immutable test contract</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(20, 7, 36, 0.7)',
                        borderRadius: '8px',
                        border: 'var(--border-faint)',
                      }}
                    >
                      <span
                        className="section-kicker"
                        style={{ fontSize: '0.72rem', color: 'var(--pink-hot)' }}
                      >
                        Target Initial URL
                      </span>
                      <p
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.85rem',
                          color: '#fff',
                          margin: '4px 0 0',
                          wordBreak: 'break-all',
                        }}
                      >
                        {test.specification.initialUrl}
                      </p>
                    </div>

                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(20, 7, 36, 0.7)',
                        borderRadius: '8px',
                        border: 'var(--border-faint)',
                      }}
                    >
                      <span
                        className="section-kicker"
                        style={{ fontSize: '0.72rem', color: 'var(--violet-bright)' }}
                      >
                        Deterministic Assertion Kind
                      </span>
                      <p
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.85rem',
                          color: '#fff',
                          margin: '4px 0 0',
                        }}
                      >
                        {test.specification.assertion.kind}
                      </p>
                    </div>

                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(20, 7, 36, 0.7)',
                        borderRadius: '8px',
                        border: 'var(--border-faint)',
                      }}
                    >
                      <span
                        className="section-kicker"
                        style={{ fontSize: '0.72rem', color: 'var(--cyan-accent)' }}
                      >
                        Safety & Replay Contract
                      </span>
                      <p
                        style={{
                          fontSize: '0.82rem',
                          color: 'var(--lavender-muted)',
                          margin: '4px 0 0',
                        }}
                      >
                        Re-executed with isolated browser contexts, credentials redacted, and strict
                        SSRF interception.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Execution History List (Screen 08) */}
              <div className="glass-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">Execution Attempts History</h3>
                    <p className="panel-subtitle">Audited record of all replayed attempts</p>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: 'rgba(255, 20, 147, 0.15)',
                      border: '1px solid rgba(255, 20, 147, 0.35)',
                      fontSize: '0.78rem',
                      color: 'var(--pink-light)',
                      fontWeight: 700,
                    }}
                  >
                    {executions.length} Total Attempt{executions.length === 1 ? '' : 's'}
                  </span>
                </div>

                {executions.length === 0 ? (
                  <div className="empty-state-box">
                    <p>No execution attempts have been run for this test yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {executions.map((exec) => (
                      <div
                        key={exec.id}
                        style={{
                          padding: '20px',
                          background: 'rgba(26, 10, 44, 0.75)',
                          border: 'var(--border-glass)',
                          borderRadius: '14px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <strong style={{ fontSize: '1.1rem', color: '#fff' }}>
                              Attempt #{exec.attemptNumber}
                            </strong>
                            <span className={`status-pill ${exec.status.toLowerCase()}`}>
                              {exec.status.replaceAll('_', ' ')}
                            </span>
                          </div>

                          <time style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            {formatDate(exec.createdAt)}
                          </time>
                        </div>

                        {exec.failureReason ? (
                          <div className="feedback-box error" style={{ margin: '10px 0 12px' }}>
                            <span>{exec.failureReason}</span>
                          </div>
                        ) : null}

                        {exec.assertions && exec.assertions.length > 0 ? (
                          <div style={{ marginTop: '12px' }}>
                            <span className="section-kicker" style={{ fontSize: '0.72rem' }}>
                              Evaluated Assertions ({exec.assertions.length})
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                marginTop: '6px',
                              }}
                            >
                              {exec.assertions.map((a, i) => (
                                <div
                                  key={`${a.kind}-${i}`}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(14, 5, 24, 0.8)',
                                    border: 'var(--border-faint)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '0.84rem',
                                  }}
                                >
                                  <span
                                    style={{
                                      color: 'var(--lavender-mid)',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    {a.kind}
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: 800,
                                      fontSize: '0.76rem',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      background: a.passed
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : 'rgba(244, 63, 94, 0.2)',
                                      color: a.passed ? '#34d399' : '#fb7185',
                                    }}
                                  >
                                    {a.passed ? 'PASSED' : 'FAILED'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="feedback-box error" role="alert">
              <span>{message}</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
