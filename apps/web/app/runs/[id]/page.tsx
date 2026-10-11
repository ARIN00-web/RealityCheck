'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDate, targetLabel } from '../../dashboard-utils';
import { Sidebar } from '../../components/Sidebar';
import { Topbar } from '../../components/Topbar';
import { BrowserMockup } from '../../components/BrowserMockup';

type RunDetail = {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  target: { id: string; url: string };
  events: Array<{ id: string; type: string; message: string; data: unknown; createdAt: string }>;
  artifacts: Array<{ id: string; contentType: string | null; createdAt: string }>;
  findings: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    createdAt: string;
  }>;
  journeys: Array<{
    id: string;
    name: string;
    position: number;
    status: string;
    actions: Array<{
      id: string;
      position: number;
      type: string;
      target: string | null;
      status: string;
      detail: {
        label: string | null;
        beforeUrl: string | null;
        afterUrl: string | null;
        reason: string | null;
      };
    }>;
  }>;
};

type FindingReport = {
  category?: string;
  severity?: string;
  confidence?: string;
  summary?: string;
  expected?: string;
  actual?: string;
  reproductionSteps?: string[];
  rationale?: string;
  affectedUrl?: string;
  evidence?: Array<{ kind: string; detail: string }>;
};

function parseFindingReport(description: string | null): FindingReport | null {
  if (!description) return null;
  try {
    const parsed: unknown = JSON.parse(description);
    return parsed && typeof parsed === 'object' ? (parsed as FindingReport) : null;
  } catch {
    return null;
  }
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [message, setMessage] = useState('Loading run details…');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'actions' | 'findings' | 'console' | 'events'>(
    'actions',
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadRun = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/runs/${params.id}`);
      if (!response.ok)
        throw new Error(response.status === 404 ? 'Run not found.' : 'Unable to load run details.');
      setRun(await response.json());
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load run details.');
    }
  }, [params.id]);

  async function verifyFinding(findingId: string): Promise<void> {
    setVerifyingId(findingId);
    try {
      const res = await fetch(`/api/findings/${findingId}/verify`, { method: 'POST' });
      if (res.ok) {
        await loadRun();
      }
    } finally {
      setVerifyingId(null);
    }
  }

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  useEffect(() => {
    if (!run || (run.status !== 'QUEUED' && run.status !== 'RUNNING')) return;
    const timeout = window.setTimeout(() => void loadRun(), 3_000);
    return () => window.clearTimeout(timeout);
  }, [loadRun, run]);

  const screenshotArtifact = run?.artifacts.find((a) => a.contentType === 'image/png');
  const screenshotUrl =
    screenshotArtifact && run ? `/api/runs/${run.id}/artifacts/${screenshotArtifact.id}` : null;

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="page-container" style={{ maxWidth: '1350px' }}>
          <a
            href={run ? `/targets/${run.target.id}` : '/'}
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

          {run ? (
            <div>
              {/* Run Header Card (Screen 04) */}
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
                        gap: '12px',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        className="section-kicker"
                        style={{ color: 'var(--pink-hot)', margin: 0 }}
                      >
                        Exploration Run #{run.id.slice(-6)}
                      </span>
                      <span className={`status-pill ${run.status.toLowerCase()}`}>
                        {run.status.replaceAll('_', ' ')}
                      </span>
                    </div>

                    <h1
                      style={{
                        fontSize: '2rem',
                        fontWeight: 900,
                        color: '#fff',
                        margin: '4px 0 8px',
                      }}
                    >
                      {targetLabel(run.target.url)}
                    </h1>

                    <p
                      style={{
                        color: 'var(--lavender-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.86rem',
                        margin: 0,
                      }}
                    >
                      Target: {run.target.url} · Created {formatDate(run.createdAt)}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span
                      style={{
                        padding: '6px 14px',
                        background: 'rgba(255, 20, 147, 0.15)',
                        border: '1px solid rgba(255, 20, 147, 0.35)',
                        borderRadius: '20px',
                        fontSize: '0.82rem',
                        color: 'var(--pink-light)',
                        fontWeight: 700,
                      }}
                    >
                      {run.findings.length} Finding{run.findings.length === 1 ? '' : 's'} Discovered
                    </span>
                  </div>
                </div>

                {run.error ? (
                  <div
                    className="feedback-box error"
                    style={{ marginTop: '16px', marginBottom: 0 }}
                  >
                    <span>{run.error}</span>
                  </div>
                ) : null}
              </div>

              {/* Two Column Layout matching Screen 04 & Screen 14 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '24px' }}>
                {/* Left Column: Interactive Tabs */}
                <div>
                  <div className="nav-tabs">
                    <button
                      type="button"
                      className={`nav-tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
                      onClick={() => setActiveTab('actions')}
                    >
                      Browser Actions ({run.journeys.reduce((sum, j) => sum + j.actions.length, 0)})
                    </button>
                    <button
                      type="button"
                      className={`nav-tab-btn ${activeTab === 'findings' ? 'active' : ''}`}
                      onClick={() => setActiveTab('findings')}
                    >
                      Findings ({run.findings.length})
                    </button>
                    <button
                      type="button"
                      className={`nav-tab-btn ${activeTab === 'console' ? 'active' : ''}`}
                      onClick={() => setActiveTab('console')}
                    >
                      Console & Network
                    </button>
                    <button
                      type="button"
                      className={`nav-tab-btn ${activeTab === 'events' ? 'active' : ''}`}
                      onClick={() => setActiveTab('events')}
                    >
                      Timeline Events ({run.events.length})
                    </button>
                  </div>

                  {/* TAB 1: BROWSER ACTIONS */}
                  {activeTab === 'actions' && (
                    <div className="glass-panel" style={{ margin: 0 }}>
                      <div className="panel-header">
                        <div>
                          <h3 className="panel-title">Recorded Interaction Sequence</h3>
                          <p className="panel-subtitle">
                            Deterministic browser actions executed during exploration
                          </p>
                        </div>
                      </div>

                      {run.journeys.every((j) => j.actions.length === 0) ? (
                        <div className="empty-state-box">
                          <p>No interactive actions were attempted for this page.</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {run.journeys.map((journey) => (
                            <div
                              key={journey.id}
                              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                            >
                              {journey.actions.map((action, idx) => (
                                <div key={action.id} className="timeline-step">
                                  <div className="step-info">
                                    <div className="step-badge">{idx + 1}</div>
                                    <div style={{ minWidth: 0 }}>
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '10px',
                                        }}
                                      >
                                        <strong
                                          style={{
                                            fontSize: '0.94rem',
                                            color: '#fff',
                                            textTransform: 'capitalize',
                                          }}
                                        >
                                          {action.type}
                                        </strong>
                                        <span
                                          className={`status-pill ${action.status.toLowerCase()}`}
                                        >
                                          {action.status.toLowerCase()}
                                        </span>
                                      </div>
                                      {action.detail.label ? (
                                        <p
                                          style={{
                                            margin: '4px 0 0',
                                            fontSize: '0.85rem',
                                            color: 'var(--lavender-mid)',
                                          }}
                                        >
                                          {action.detail.label}
                                        </p>
                                      ) : null}
                                      {action.target ? (
                                        <span
                                          style={{
                                            fontSize: '0.78rem',
                                            color: 'var(--text-dim)',
                                            fontFamily: 'var(--font-mono)',
                                          }}
                                        >
                                          {action.target}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="step-meta">
                                    <span className="duration-tag">
                                      {action.status === 'SUCCEEDED' ? '✓ OK' : '✕'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: FINDINGS */}
                  {activeTab === 'findings' && (
                    <div className="glass-panel" style={{ margin: 0 }}>
                      <div className="panel-header">
                        <div>
                          <h3 className="panel-title">Discovered Candidate Findings</h3>
                          <p className="panel-subtitle">
                            Anomalies captured from browser instrumentation
                          </p>
                        </div>
                      </div>

                      {run.findings.length === 0 ? (
                        <div className="empty-state-box">
                          <p>No candidate findings recorded for this run.</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {run.findings.map((finding) => {
                            const report = parseFindingReport(finding.description);
                            return (
                              <div
                                key={finding.id}
                                style={{
                                  padding: '20px',
                                  background: 'rgba(28, 10, 48, 0.75)',
                                  border: 'var(--border-glass)',
                                  borderRadius: '14px',
                                  boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: '12px',
                                    marginBottom: '12px',
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '6px',
                                      }}
                                    >
                                      <span className="severity-pill high">High</span>
                                      <span
                                        className={`status-pill ${finding.status.toLowerCase()}`}
                                      >
                                        {finding.status}
                                      </span>
                                    </div>
                                    <h4
                                      style={{
                                        fontSize: '1.15rem',
                                        fontWeight: 800,
                                        color: '#fff',
                                        margin: 0,
                                      }}
                                    >
                                      {finding.title}
                                    </h4>
                                  </div>

                                  {finding.status === 'CANDIDATE' ? (
                                    <button
                                      type="button"
                                      className="btn-primary btn-sm"
                                      onClick={() => verifyFinding(finding.id)}
                                      disabled={verifyingId === finding.id}
                                    >
                                      {verifyingId === finding.id ? 'Verifying…' : 'Verify finding'}
                                    </button>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: '0.8rem',
                                        color: '#34d399',
                                        fontWeight: 700,
                                      }}
                                    >
                                      ✓ Verified
                                    </span>
                                  )}
                                </div>

                                {report ? (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '8px',
                                      fontSize: '0.88rem',
                                    }}
                                  >
                                    <p style={{ color: 'var(--lavender-mid)', margin: 0 }}>
                                      {report.summary}
                                    </p>
                                    <div
                                      style={{
                                        padding: '10px 14px',
                                        background: 'rgba(12, 4, 22, 0.8)',
                                        border: '1px solid rgba(255, 20, 147, 0.25)',
                                        borderRadius: '8px',
                                        color: '#ff94a8',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '0.82rem',
                                        wordBreak: 'break-all',
                                      }}
                                    >
                                      {report.actual}
                                    </div>
                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                                      Category: {report.category} · Affected URL:{' '}
                                      {report.affectedUrl}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: CONSOLE & NETWORK */}
                  {activeTab === 'console' && (
                    <div className="glass-panel" style={{ margin: 0 }}>
                      <div className="panel-header">
                        <div>
                          <h3 className="panel-title">Console Output & HTTP Signals</h3>
                          <p className="panel-subtitle">
                            Errors and failed requests intercepted by Playwright
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          background: 'rgba(8, 2, 16, 0.95)',
                          border: 'var(--border-glass)',
                          borderRadius: '10px',
                          padding: '16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          color: 'var(--lavender-mid)',
                          minHeight: '220px',
                          maxHeight: '360px',
                          overflowY: 'auto',
                        }}
                      >
                        {run.events
                          .filter((e) => e.type === 'EXPLORATION_OBSERVATION')
                          .map((e) => {
                            const data = e.data as {
                              consoleErrors?: string[];
                              pageErrors?: string[];
                              httpErrors?: unknown[];
                            };
                            return (
                              <div key={e.id}>
                                {data?.consoleErrors && data.consoleErrors.length > 0 ? (
                                  <div>
                                    <strong style={{ color: '#ff4d6d' }}>Console Errors:</strong>
                                    {data.consoleErrors.map((err, i) => (
                                      <p
                                        key={i}
                                        style={{ color: '#ff77b8', margin: '4px 0 8px 12px' }}
                                      >
                                        ▶ {err}
                                      </p>
                                    ))}
                                  </div>
                                ) : null}

                                {data?.pageErrors && data.pageErrors.length > 0 ? (
                                  <div style={{ marginTop: '10px' }}>
                                    <strong style={{ color: '#fb7185' }}>
                                      Uncaught Page Exceptions:
                                    </strong>
                                    {data.pageErrors.map((err, i) => (
                                      <p
                                        key={i}
                                        style={{ color: '#fb7185', margin: '4px 0 8px 12px' }}
                                      >
                                        ✕ {err}
                                      </p>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        <p style={{ color: 'var(--text-dim)', margin: '8px 0 0' }}>
                          ✓ Network traffic monitored and filtered by SSRF security policy.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: EVENTS */}
                  {activeTab === 'events' && (
                    <div className="glass-panel" style={{ margin: 0 }}>
                      <div className="panel-header">
                        <div>
                          <h3 className="panel-title">Execution Event Stream</h3>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {run.events.map((event) => (
                          <div
                            key={event.id}
                            style={{
                              padding: '12px 16px',
                              background: 'rgba(26, 10, 44, 0.7)',
                              border: 'var(--border-glass)',
                              borderRadius: '10px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '4px',
                              }}
                            >
                              <strong
                                style={{ fontSize: '0.88rem', color: 'var(--magenta-bright)' }}
                              >
                                {event.type}
                              </strong>
                              <time style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                {formatDate(event.createdAt)}
                              </time>
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: '0.84rem',
                                color: 'var(--lavender-mid)',
                              }}
                            >
                              {event.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Cinematic Browser Mockup Frame (Screen 04 & 14) */}
                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <h3
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        color: '#fff',
                        margin: '0 0 4px',
                      }}
                    >
                      Cinematic Browser Observation
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                      High-resolution artifact rendered by headless Chromium
                    </p>
                  </div>

                  <BrowserMockup url={run.target.url} screenshotUrl={screenshotUrl} height={380} />
                </div>
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
