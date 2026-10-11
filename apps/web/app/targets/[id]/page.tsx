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
    <main className="dashboard-shell detail-shell">
      <a className="back-link" href="/">
        ← All targets
      </a>
      {target ? (
        <section className="detail-card">
          <p className="eyebrow">Target history</p>
          <h1>{targetLabel(target.url)}</h1>
          <p className="url">{target.url}</p>
          <p className="muted">
            {target.runCount} recorded run{target.runCount === 1 ? '' : 's'}
          </p>
          <button type="button" onClick={startRun} disabled={starting}>
            {starting ? 'Queueing…' : 'Start browser run'}
          </button>
          {message ? (
            <p className="feedback success" role="status">
              {message}
            </p>
          ) : null}

          {/* Browser runs section */}
          <div style={{ marginTop: '28px' }}>
            <h2>Recorded browser runs</h2>
            {target.runs.length === 0 ? (
              <div className="empty-state">
                <p>No runs have been recorded for this target.</p>
              </div>
            ) : null}
            <ol className="run-list detail-runs">
              {target.runs.map((run) => (
                <li key={run.id}>
                  <span className={`run-status ${run.status.toLowerCase()}`}>
                    {run.status.replaceAll('_', ' ')}
                  </span>
                  <div>
                    <a className="back-link" href={`/runs/${run.id}`}>
                      Run {run.id}
                    </a>
                    <time>{formatDate(run.createdAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Regression tests section */}
          <section className="regression-section">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Repeatable QA</p>
                <h2>Regression tests</h2>
              </div>
              <span className="count">{regressionTests.length}</span>
            </div>

            {regressionTests.length === 0 ? (
              <div className="empty-state">
                <p>No regression tests have been created for this target yet.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {regressionTests.map((test) => (
                  <article key={test.id} className="item-card">
                    <div className="item-card-header">
                      <div>
                        <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>{test.name}</h3>
                        <time>{formatDate(test.createdAt)}</time>
                      </div>
                      <a className="back-link" href={`/regression-tests/${test.id}`}>
                        View test & history →
                      </a>
                    </div>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                      {test.specification.steps.length} step
                      {test.specification.steps.length === 1 ? '' : 's'} · Assertion:{' '}
                      {test.specification.assertion.kind}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Eligible candidate findings */}
          <section className="regression-section">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Candidate bugs</p>
                <h2>Findings eligible for regression testing</h2>
              </div>
              <span className="count">{regressionFindings.length}</span>
            </div>

            {regressionFindings.length === 0 ? (
              <div className="empty-state">
                <p>No findings recorded yet for this target.</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
                {regressionFindings.map((finding) => (
                  <li
                    key={finding.findingId}
                    style={{
                      padding: '12px 16px',
                      background: '#091525',
                      borderRadius: '10px',
                      border: '1px solid #243a51',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>{finding.title}</strong>
                      {finding.reason ? (
                        <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                          {finding.reason}
                        </p>
                      ) : null}
                    </div>
                    {finding.eligible ? (
                      <button
                        type="button"
                        className="secondary-button small-button"
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
                        className="secondary-button small-button"
                        onClick={() => verifyFinding(finding.findingId)}
                        disabled={verifyingFindingId === finding.findingId}
                      >
                        {verifyingFindingId === finding.findingId ? 'Verifying…' : 'Verify finding'}
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        Ineligible
                      </span>
                    )}
                  </li>
                ))}
              </ul>
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
