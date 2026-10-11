'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  formatDate,
  targetLabel,
  type DashboardRegressionFinding,
  type DashboardRegressionTest,
  type DashboardTarget,
} from '../../dashboard-utils';
import { Sidebar } from '../../components/Sidebar';
import { Topbar } from '../../components/Topbar';
import { AttackSurfaceGraph } from '../../components/AttackSurfaceGraph';

type TargetDetail = DashboardTarget & {
  runs: Array<{
    id: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  }>;
};

export default function TargetDetailPage() {
  const params = useParams<{ id: string }>();
  const [target, setTarget] = useState<TargetDetail | null>(null);
  const [regressionTests, setRegressionTests] = useState<DashboardRegressionTest[]>([]);
  const [regressionFindings, setRegressionFindings] = useState<DashboardRegressionFinding[]>([]);
  const [message, setMessage] = useState('Loading target history…');
  const [starting, setStarting] = useState(false);
  const [creatingFindingId, setCreatingFindingId] = useState<string | null>(null);
  const [verifyingFindingId, setVerifyingFindingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'runs' | 'findings' | 'regressions' | 'graph'>('runs');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadTarget = useCallback(async (): Promise<void> => {
    try {
      const [targetRes, testsRes, findingsRes] = await Promise.all([
        fetch(`/api/targets/${params.id}`),
        fetch(`/api/targets/${params.id}/regression-tests`),
        fetch(`/api/targets/${params.id}/regression-findings`),
      ]);

      if (targetRes.status === 404) {
        setMessage('This target no longer exists.');
        return;
      }
      if (!targetRes.ok) {
        throw new Error('Unable to load this target history.');
      }
      setTarget(await targetRes.json());

      if (testsRes.ok) {
        setRegressionTests(await testsRes.json());
      }
      if (findingsRes.ok) {
        setRegressionFindings(await findingsRes.json());
      }
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load this target history.');
    }
  }, [params.id]);

  useEffect(() => {
    void loadTarget();
  }, [loadTarget]);

  useEffect(() => {
    if (!target?.runs.some((run) => run.status === 'QUEUED' || run.status === 'RUNNING')) return;
    const timeout = window.setTimeout(() => void loadTarget(), 3_000);
    return () => window.clearTimeout(timeout);
  }, [loadTarget, target]);

  async function startRun(): Promise<void> {
    setStarting(true);
    setMessage('');
    try {
      const response = await fetch(`/api/targets/${params.id}/runs`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Unable to queue a browser run.');
      setMessage('Browser run queued. Status updates automatically while it is active.');
      await loadTarget();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to queue a browser run.');
    } finally {
      setStarting(false);
    }
  }

  async function createTest(findingId: string): Promise<void> {
    setCreatingFindingId(findingId);
    try {
      const res = await fetch(`/api/findings/${findingId}/regression-test`, {
        method: 'POST',
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error?.message ?? 'Unable to create regression test.');
      }
      setMessage(`Regression test created: ${body.name}`);
      await loadTarget();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create regression test.');
    } finally {
      setCreatingFindingId(null);
    }
  }

  async function verifyFinding(findingId: string): Promise<void> {
    setVerifyingFindingId(findingId);
    try {
      const res = await fetch(`/api/findings/${findingId}/verify`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error?.message ?? 'Unable to verify finding.');
      }
      setMessage(`Finding verified: ${body.title}`);
      await loadTarget();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to verify finding.');
    } finally {
      setVerifyingFindingId(null);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="page-container" style={{ maxWidth: '1200px' }}>
          <a
            href="/"
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
            ← Back to Dashboard
          </a>

          {target ? (
            <div>
              {/* Target Header Card */}
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
                    <span className="section-kicker" style={{ color: 'var(--pink-hot)' }}>
                      Target Details
                    </span>
                    <h1
                      style={{
                        fontSize: '2.2rem',
                        fontWeight: 900,
                        color: '#fff',
                        margin: '4px 0 8px',
                      }}
                    >
                      {targetLabel(target.url)}
                    </h1>
                    <p
                      style={{
                        color: 'var(--lavender-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.88rem',
                        margin: '0 0 12px',
                        wordBreak: 'break-all',
                      }}
                    >
                      {target.url}
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
                      <span>{target.runCount} exploration runs recorded</span>
                      <span>·</span>
                      <span>Updated {formatDate(target.updatedAt)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={startRun}
                      disabled={
                        starting ||
                        target.runs.some((r) => r.status === 'RUNNING' || r.status === 'QUEUED')
                      }
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
                          : target.runs.some((r) => r.status === 'RUNNING' || r.status === 'QUEUED')
                            ? 'Run in progress…'
                            : 'Start browser run'}
                      </span>
                    </button>
                  </div>
                </div>

                {message ? (
                  <div
                    className={`feedback-box ${message.includes('Unable') || message.includes('failed') ? 'error' : 'success'}`}
                    style={{ marginTop: '20px', marginBottom: 0 }}
                    role="status"
                  >
                    <span>{message}</span>
                  </div>
                ) : null}
              </div>

              {/* Navigation Tabs */}
              <div className="nav-tabs">
                <button
                  type="button"
                  className={`nav-tab-btn ${activeTab === 'runs' ? 'active' : ''}`}
                  onClick={() => setActiveTab('runs')}
                >
                  Browser Runs ({target.runs.length})
                </button>
                <button
                  type="button"
                  className={`nav-tab-btn ${activeTab === 'findings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('findings')}
                >
                  Eligible Findings ({regressionFindings.length})
                </button>
                <button
                  type="button"
                  className={`nav-tab-btn ${activeTab === 'regressions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('regressions')}
                >
                  Regression Tests ({regressionTests.length})
                </button>
                <button
                  type="button"
                  className={`nav-tab-btn ${activeTab === 'graph' ? 'active' : ''}`}
                  onClick={() => setActiveTab('graph')}
                >
                  Attack Graph
                </button>
              </div>

              {/* TAB 1: BROWSER RUNS */}
              {activeTab === 'runs' && (
                <div className="glass-panel">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">Exploration History</h3>
                      <p className="panel-subtitle">
                        Past browser executions and status transitions
                      </p>
                    </div>
                  </div>

                  {target.runs.length === 0 ? (
                    <div className="empty-state-box">
                      <p>No browser runs have been recorded for this target yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {target.runs.map((run) => (
                        <div
                          key={run.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            background: 'rgba(26, 10, 44, 0.7)',
                            border: 'var(--border-glass)',
                            borderRadius: '12px',
                            gap: '16px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <span className={`status-pill ${run.status.toLowerCase()}`}>
                              {run.status.replaceAll('_', ' ')}
                            </span>
                            <div>
                              <strong style={{ fontSize: '1rem', color: '#fff', display: 'block' }}>
                                Run {run.id}
                              </strong>
                              <time style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {formatDate(run.createdAt)}
                              </time>
                            </div>
                          </div>

                          <a href={`/runs/${run.id}`} className="btn-secondary btn-sm">
                            Inspect Run →
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ELIGIBLE FINDINGS */}
              {activeTab === 'findings' && (
                <div className="glass-panel">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">Findings Eligible for Regression Testing</h3>
                      <p className="panel-subtitle">
                        Findings independently verified with deterministic browser reproduction
                        steps
                      </p>
                    </div>
                  </div>

                  {regressionFindings.length === 0 ? (
                    <div className="empty-state-box">
                      <p>No candidate findings recorded yet for this target.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {regressionFindings.map((finding) => (
                        <div
                          key={finding.findingId}
                          style={{
                            padding: '18px 22px',
                            background: 'rgba(26, 10, 44, 0.7)',
                            border: 'var(--border-glass)',
                            borderRadius: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '16px',
                          }}
                        >
                          <div>
                            <strong
                              style={{ fontSize: '1.05rem', color: '#fff', display: 'block' }}
                            >
                              {finding.title}
                            </strong>
                            {finding.reason ? (
                              <p
                                style={{
                                  margin: '4px 0 0',
                                  fontSize: '0.84rem',
                                  color: 'var(--lavender-muted)',
                                }}
                              >
                                {finding.reason}
                              </p>
                            ) : null}
                          </div>

                          <div>
                            {finding.eligible ? (
                              <button
                                type="button"
                                className="btn-primary btn-sm"
                                onClick={() => createTest(finding.findingId)}
                                disabled={creatingFindingId === finding.findingId}
                              >
                                {creatingFindingId === finding.findingId
                                  ? 'Creating…'
                                  : 'Create regression test'}
                              </button>
                            ) : finding.reason ===
                              'Only independently verified findings can become regression tests.' ? (
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => verifyFinding(finding.findingId)}
                                disabled={verifyingFindingId === finding.findingId}
                              >
                                {verifyingFindingId === finding.findingId
                                  ? 'Verifying…'
                                  : 'Verify finding'}
                              </button>
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text-dim)',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                }}
                              >
                                Ineligible
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: REGRESSION TESTS */}
              {activeTab === 'regressions' && (
                <div className="glass-panel">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">Repeatable Regression Tests</h3>
                      <p className="panel-subtitle">
                        Deterministic assertions replayed against this target
                      </p>
                    </div>
                  </div>

                  {regressionTests.length === 0 ? (
                    <div className="empty-state-box">
                      <p>No regression tests have been created for this target yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {regressionTests.map((test) => (
                        <div
                          key={test.id}
                          style={{
                            padding: '18px 22px',
                            background: 'rgba(26, 10, 44, 0.7)',
                            border: 'var(--border-glass)',
                            borderRadius: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '16px',
                          }}
                        >
                          <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: '#fff' }}>
                              {test.name}
                            </h3>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Created {formatDate(test.createdAt)} ·{' '}
                              {test.specification.steps.length} deterministic steps · Assertion:{' '}
                              {test.specification.assertion.kind}
                            </span>
                          </div>

                          <a href={`/regression-tests/${test.id}`} className="btn-primary btn-sm">
                            View test & history →
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: ATTACK GRAPH */}
              {activeTab === 'graph' && (
                <div className="glass-panel">
                  <AttackSurfaceGraph targetsCount={1} findingsCount={regressionFindings.length} />
                </div>
              )}
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
