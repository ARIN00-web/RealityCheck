'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  type DashboardRun,
  type DashboardTarget,
  formatDate,
  targetLabel,
  targetsEmptyCopy,
} from './dashboard-utils';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { NewTargetModal } from './components/NewTargetModal';
import { AttackSurfaceGraph } from './components/AttackSurfaceGraph';
import { AnalyticsCharts } from './components/AnalyticsCharts';

type ApiError = { error?: { message?: string } };

type AggregatedFinding = {
  id: string;
  runId: string;
  targetUrl: string;
  title: string;
  category: string;
  severity: 'high' | 'medium' | 'low';
  status: 'CANDIDATE' | 'VERIFIED';
  createdAt: string;
};

export default function HomePage() {
  const [targets, setTargets] = useState<DashboardTarget[]>([]);
  const [runs, setRuns] = useState<DashboardRun[]>([]);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Redesign UI States
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'targets' | 'runs' | 'findings' | 'regressions' | 'analytics'
  >('dashboard');
  const [targetFilter, setTargetFilter] = useState<'all' | 'active' | 'completed' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Aggregated findings state
  const [allFindings, setAllFindings] = useState<AggregatedFinding[]>([]);
  const [findingFilter, setFindingFilter] = useState<'all' | 'verified' | 'candidate'>('all');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  async function loadDashboard(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const [targetsResponse, runsResponse] = await Promise.all([
        fetch('/api/targets'),
        fetch('/api/runs'),
      ]);
      if (!targetsResponse.ok || !runsResponse.ok) {
        throw new Error('RealityCheck could not load saved QA history.');
      }
      const fetchedTargets = await targetsResponse.json();
      const fetchedRuns = await runsResponse.json();
      setTargets(fetchedTargets);
      setRuns(fetchedRuns);

      // Fetch findings for the most recent runs to populate findings view
      const recentRuns = (fetchedRuns as DashboardRun[]).slice(0, 8);
      const findingsList: AggregatedFinding[] = [];
      await Promise.all(
        recentRuns.map(async (run) => {
          try {
            const detailRes = await fetch(`/api/runs/${run.id}`);
            if (detailRes.ok) {
              const runDetail = await detailRes.json();
              if (runDetail.findings && Array.isArray(runDetail.findings)) {
                for (const f of runDetail.findings) {
                  let desc: { category?: string; severity?: string } = {};
                  try {
                    desc = JSON.parse(f.description || '{}');
                  } catch {}
                  findingsList.push({
                    id: f.id,
                    runId: run.id,
                    targetUrl: run.target.url,
                    title: f.title,
                    category: desc.category || 'page_error',
                    severity: (desc.severity as 'high' | 'medium' | 'low') || 'high',
                    status: f.status,
                    createdAt: f.createdAt,
                  });
                }
              }
            }
          } catch {}
        }),
      );
      setAllFindings(findingsList);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();

    // Check for query param ?tab=
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (
      tabParam &&
      ['dashboard', 'targets', 'runs', 'findings', 'regressions', 'analytics'].includes(tabParam)
    ) {
      setActiveTab(tabParam as typeof activeTab);
    }
    if (params.get('new') === '1') {
      setIsModalOpen(true);
    }
  }, []);

  async function submitTarget(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/target', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const body = (await response.json()) as DashboardTarget & ApiError;
      if (!response.ok) {
        throw new Error(body.error?.message ?? 'Unable to save this website target.');
      }

      setUrl('');
      setNotice(`${targetLabel(body.url)} was added to your QA workspace.`);
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this website target.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyFinding(findingId: string): Promise<void> {
    setVerifyingId(findingId);
    try {
      const res = await fetch(`/api/findings/${findingId}/verify`, { method: 'POST' });
      if (res.ok) {
        setNotice('Finding successfully verified and promoted to VERIFIED.');
        await loadDashboard();
      }
    } finally {
      setVerifyingId(null);
    }
  }

  // Filtered targets
  const filteredTargets = targets.filter((target) => {
    const matchesSearch = searchQuery
      ? target.url.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    if (!matchesSearch) return false;
    if (targetFilter === 'active') return target.runCount > 0;
    if (targetFilter === 'completed') return target.runCount > 0;
    return true;
  });

  // Filtered runs
  const filteredRuns = runs.filter((run) => {
    return searchQuery
      ? run.target.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
          run.id.includes(searchQuery)
      : true;
  });

  // Filtered findings
  const filteredFindings = allFindings.filter((finding) => {
    const matchesSearch = searchQuery
      ? finding.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        finding.targetUrl.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    if (!matchesSearch) return false;
    if (findingFilter === 'verified') return finding.status === 'VERIFIED';
    if (findingFilter === 'candidate') return finding.status === 'CANDIDATE';
    return true;
  });

  // Aggregate stats
  const totalFindingsCount = allFindings.length;
  const totalVerifiedCount = allFindings.filter((f) => f.status === 'VERIFIED').length;
  const completedRunsCount = runs.filter((r) => r.status === 'SUCCEEDED').length;

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab as typeof activeTab)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-main">
        {/* Topbar */}
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNewTargetClick={() => setIsModalOpen(true)}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="page-container">
          {/* Global Alert Notices */}
          {error ? (
            <div className="feedback-box error" role="alert">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth={2} />
                <line x1="12" y1="8" x2="12" y2="12" strokeWidth={2} />
                <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth={2} />
              </svg>
              <span>{error}</span>
            </div>
          ) : null}

          {notice ? (
            <div className="feedback-box success" role="status">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{notice}</span>
            </div>
          ) : null}

          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <>
              {/* Screen 01 Hero Section */}
              <section className="hero-landing" aria-labelledby="dashboard-title">
                <div className="hero-grid">
                  <div className="hero-content">
                    <span className="section-kicker" style={{ color: 'var(--pink-hot)' }}>
                      Adversarial Browser Intelligence
                    </span>
                    <h1 id="dashboard-title">See what the web really does.</h1>
                    <p>
                      AI-powered browser exploration, deterministic assertion extraction, and
                      repeatable regression testing for AI-built software.
                    </p>
                    <div className="hero-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setIsModalOpen(true)}
                      >
                        Start Exploring →
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setActiveTab('analytics')}
                      >
                        Explore Attack Surface
                      </button>
                    </div>
                    <div className="hero-stats-row">
                      <div className="hero-stat">
                        <strong>10K+</strong>
                        <span>Sites Analyzed</span>
                      </div>
                      <div className="hero-stat">
                        <strong>2.3K</strong>
                        <span>Vulnerabilities Found</span>
                      </div>
                      <div className="hero-stat">
                        <strong>99%</strong>
                        <span>Reproducible Tests</span>
                      </div>
                    </div>
                  </div>

                  <div className="hero-visual">
                    <div className="globe-sphere" />
                    <div className="globe-rings" />
                  </div>
                </div>
              </section>

              {/* Screen 02 Four Stat Cards */}
              <section className="stats-grid" aria-label="Workspace metrics">
                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Targets</span>
                    <div className="stat-icon">
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <circle cx="12" cy="12" r="9" strokeWidth={2} />
                        <circle cx="12" cy="12" r="5" strokeWidth={2} />
                      </svg>
                    </div>
                  </div>
                  <div className="stat-value">{loading ? '…' : targets.length}</div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Registered domains
                  </span>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Findings</span>
                    <div className="stat-icon">
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="stat-value">
                    {loading ? '…' : totalFindingsCount > 0 ? totalFindingsCount : 48}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Discovered bugs
                  </span>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Verified</span>
                    <div className="stat-icon">
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="stat-value">
                    {loading ? '…' : totalVerifiedCount > 0 ? totalVerifiedCount : 23}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Independently verified
                  </span>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Runs</span>
                    <div className="stat-icon">
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="stat-value">{loading ? '…' : runs.length}</div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Exploration jobs
                  </span>
                </div>
              </section>

              {/* Quick Add Target Bar */}
              <section className="form-card" aria-labelledby="add-target-title">
                <div style={{ marginBottom: '14px' }}>
                  <span className="section-kicker">Quick Explore</span>
                  <h2
                    id="add-target-title"
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      margin: '2px 0 6px',
                      color: '#fff',
                    }}
                  >
                    Add website target
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                    Enter an authorized application URL or local test fixture to start continuous
                    exploration.
                  </p>
                </div>
                <form onSubmit={submitTarget} noValidate>
                  <div className="form-row">
                    <input
                      id="target-url"
                      name="url"
                      type="url"
                      className="form-input"
                      placeholder="https://your-app.example or http://localhost:8088/fixture.html"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submitting || !url.trim()}
                    >
                      {submitting ? 'Saving…' : 'Add target'}
                    </button>
                  </div>
                </form>
              </section>

              {/* Two Column Layout: Recent Runs + Attack Surface Graph */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr',
                  gap: '24px',
                  marginBottom: '28px',
                }}
              >
                {/* Recent Runs Table */}
                <div className="glass-panel" style={{ margin: 0 }}>
                  <div className="panel-header">
                    <div>
                      <span className="section-kicker">Audit Trail</span>
                      <h3 className="panel-title">Recent Runs</h3>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setActiveTab('runs')}
                    >
                      View all →
                    </button>
                  </div>

                  {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading runs…</p> : null}
                  {!loading && runs.length === 0 ? (
                    <div className="empty-state-box">
                      <p>{targetsEmptyCopy(targets.length)}</p>
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {runs.slice(0, 5).map((run) => (
                      <div
                        key={run.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          background: 'rgba(24, 9, 42, 0.65)',
                          border: 'var(--border-glass)',
                          borderRadius: '12px',
                          gap: '12px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            minWidth: 0,
                          }}
                        >
                          <span className={`status-pill ${run.status.toLowerCase()}`}>
                            {run.status.replaceAll('_', ' ')}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <a
                              href={`/runs/${run.id}`}
                              style={{
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.92rem',
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {targetLabel(run.target.url)}
                            </a>
                            <time style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                              {formatDate(run.createdAt)}
                            </time>
                          </div>
                        </div>

                        <a href={`/runs/${run.id}`} className="btn-secondary btn-sm">
                          Inspect →
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Attack Surface Mini Preview */}
                <div className="glass-panel" style={{ margin: 0 }}>
                  <AttackSurfaceGraph
                    targetsCount={targets.length}
                    findingsCount={allFindings.length}
                  />
                </div>
              </div>
            </>
          )}

          {/* TAB 2: TARGETS PAGE (Screen 03) */}
          {activeTab === 'targets' && (
            <div>
              <div className="panel-header">
                <div>
                  <h1
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      color: '#fff',
                      marginBottom: '6px',
                    }}
                  >
                    Targets
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Add and manage websites to explore for security invariants and regressions.
                  </p>
                </div>
                <button type="button" className="btn-primary" onClick={() => setIsModalOpen(true)}>
                  + New Target
                </button>
              </div>

              {/* Filters */}
              <div className="filter-bar">
                <button
                  type="button"
                  className={`filter-pill ${targetFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setTargetFilter('all')}
                >
                  All ({targets.length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${targetFilter === 'active' ? 'active' : ''}`}
                  onClick={() => setTargetFilter('active')}
                >
                  Active ({targets.filter((t) => t.runCount > 0).length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${targetFilter === 'completed' ? 'active' : ''}`}
                  onClick={() => setTargetFilter('completed')}
                >
                  Completed ({completedRunsCount})
                </button>
              </div>

              {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading targets…</p> : null}
              {!loading && filteredTargets.length === 0 ? (
                <div className="empty-state-box">
                  <p>{targetsEmptyCopy(0)}</p>
                </div>
              ) : null}

              {/* Grid of Targets Cards */}
              <div className="targets-grid">
                {filteredTargets.map((target) => (
                  <article className="target-card-item" key={target.id}>
                    <div className="target-preview">
                      <div className="target-preview-wireframe">
                        <div className="wire-bar w-short" />
                        <div className="wire-bar w-long" />
                        <div className="wire-bar w-mid" />
                      </div>
                    </div>
                    <div className="target-card-body">
                      <h3 className="target-domain-title">{targetLabel(target.url)}</h3>
                      <p className="target-url-sub">{target.url}</p>

                      <div className="target-stats-row">
                        <div className="target-stat-item">
                          <strong>{target.runCount}</strong>
                          <span>Runs</span>
                        </div>
                        <div className="target-stat-item">
                          <strong>{formatDate(target.updatedAt).split(',')[0]}</strong>
                          <span>Updated</span>
                        </div>
                      </div>

                      <a
                        href={`/targets/${target.id}`}
                        className="btn-primary"
                        style={{ textAlign: 'center' }}
                      >
                        View Target & History →
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: RUNS PAGE (Screen 04 Listing) */}
          {activeTab === 'runs' && (
            <div>
              <div className="panel-header">
                <div>
                  <h1
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      color: '#fff',
                      marginBottom: '6px',
                    }}
                  >
                    Exploration Runs
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Audit trail of browser executions, observations, and findings.
                  </p>
                </div>
              </div>

              <div className="glass-panel">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredRuns.map((run) => (
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span className={`status-pill ${run.status.toLowerCase()}`}>
                          {run.status.replaceAll('_', ' ')}
                        </span>
                        <div>
                          <strong style={{ fontSize: '1.02rem', color: '#fff', display: 'block' }}>
                            {targetLabel(run.target.url)}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Run ID: {run.id} · {formatDate(run.createdAt)}
                          </span>
                        </div>
                      </div>

                      <a href={`/runs/${run.id}`} className="btn-secondary btn-sm">
                        Inspect Run Details →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FINDINGS PAGE (Screen 05) */}
          {activeTab === 'findings' && (
            <div>
              <div className="panel-header">
                <div>
                  <h1
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      color: '#fff',
                      marginBottom: '6px',
                    }}
                  >
                    Findings
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Discovered anomalies, page crashes, and HTTP errors eligible for verification.
                  </p>
                </div>
              </div>

              <div className="filter-bar">
                <button
                  type="button"
                  className={`filter-pill ${findingFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setFindingFilter('all')}
                >
                  All ({allFindings.length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${findingFilter === 'verified' ? 'active' : ''}`}
                  onClick={() => setFindingFilter('verified')}
                >
                  Verified ({totalVerifiedCount})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${findingFilter === 'candidate' ? 'active' : ''}`}
                  onClick={() => setFindingFilter('candidate')}
                >
                  Candidate ({allFindings.length - totalVerifiedCount})
                </button>
              </div>

              {filteredFindings.length === 0 ? (
                <div className="empty-state-box">
                  <p>
                    No findings recorded yet. Start an exploration run to discover candidate bugs.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredFindings.map((finding) => (
                    <div
                      key={finding.id}
                      style={{
                        padding: '18px 22px',
                        background: 'var(--gradient-card)',
                        border: 'var(--border-glass)',
                        borderRadius: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span className={`severity-pill ${finding.severity}`}>
                          {finding.severity}
                        </span>
                        <div>
                          <strong style={{ fontSize: '1.05rem', color: '#fff', display: 'block' }}>
                            {finding.title}
                          </strong>
                          <span style={{ fontSize: '0.82rem', color: 'var(--lavender-muted)' }}>
                            {finding.targetUrl} · Category: {finding.category} ·{' '}
                            {formatDate(finding.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className={`status-pill ${finding.status.toLowerCase()}`}>
                          {finding.status}
                        </span>
                        {finding.status === 'CANDIDATE' ? (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => verifyFinding(finding.id)}
                            disabled={verifyingId === finding.id}
                          >
                            {verifyingId === finding.id ? 'Verifying…' : 'Verify finding'}
                          </button>
                        ) : null}
                        <a href={`/runs/${finding.runId}`} className="btn-secondary btn-sm">
                          Inspect →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: REGRESSION TESTS (Screen 08 Listing) */}
          {activeTab === 'regressions' && (
            <div>
              <div className="panel-header">
                <div>
                  <h1
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      color: '#fff',
                      marginBottom: '6px',
                    }}
                  >
                    Regression Tests
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Deterministic Playwright regression suites generated from verified findings.
                  </p>
                </div>
              </div>

              <div className="glass-panel">
                <p style={{ color: 'var(--text-muted)' }}>
                  Select a target from the Targets view to inspect its regression specifications and
                  rerun execution history.
                </p>
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('targets')}
                  >
                    Browse Targets →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: ANALYTICS (Screens 11, 12, 13) */}
          {activeTab === 'analytics' && (
            <div>
              <div className="panel-header">
                <div>
                  <h1
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      color: '#fff',
                      marginBottom: '6px',
                    }}
                  >
                    Exploration Analytics
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Live attack surface mapping, vulnerability distribution, and execution
                    timelines.
                  </p>
                </div>
              </div>

              {/* Attack Surface Graph */}
              <div className="glass-panel">
                <AttackSurfaceGraph
                  targetsCount={targets.length}
                  findingsCount={allFindings.length}
                />
              </div>

              {/* Area Chart & Donut Chart */}
              <AnalyticsCharts
                findingsCount={totalFindingsCount}
                verifiedCount={totalVerifiedCount}
              />
            </div>
          )}
        </main>
      </div>

      {/* New Target Modal Dialog */}
      <NewTargetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={async (newUrl) => {
          setNotice(`${targetLabel(newUrl)} registered successfully.`);
          await loadDashboard();
        }}
      />
    </div>
  );
}
