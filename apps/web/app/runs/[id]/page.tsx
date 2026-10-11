'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDate, targetLabel } from '../../dashboard-utils';

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

  return (
    <main className="dashboard-shell detail-shell">
      <a className="back-link" href={`/targets/${run?.target.id ?? ''}`}>
        ← Target history
      </a>
      {run ? (
        <section className="detail-card">
          <p className="eyebrow">Browser run</p>
          <h1>{targetLabel(run.target.url)}</h1>
          <p className={`run-status ${run.status.toLowerCase()}`}>
            {run.status.replaceAll('_', ' ')}
          </p>
          {run.status === 'SUCCEEDED' &&
          run.events.some((event) => event.type === 'EXPLORATION_NO_ACTIONS') ? (
            <p className="muted">
              Execution completed, but no safe exploration actions were attempted for this page.
            </p>
          ) : null}
          {run.error ? <p className="feedback error">{run.error}</p> : null}
          <h2>Browser observations</h2>
          {run.events.length === 0 ? (
            <p className="muted">No browser observations recorded yet.</p>
          ) : null}
          <ol className="run-list detail-runs">
            {run.events.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.type}</strong>
                  <time>{formatDate(event.createdAt)}</time>
                  <p className="muted">{event.message}</p>
                </div>
              </li>
            ))}
          </ol>
          <h2>Actions and outcomes</h2>
          {run.journeys.every((journey) => journey.actions.length === 0) ? (
            <p className="muted">No individual actions were recorded for this run.</p>
          ) : (
            <div className="action-journeys">
              {run.journeys.map((journey) => (
                <details className="action-journey" key={journey.id} open>
                  <summary>
                    {journey.name} · {journey.actions.length} action
                    {journey.actions.length === 1 ? '' : 's'} · {journey.status.toLowerCase()}
                  </summary>
                  <ol className="action-list">
                    {journey.actions.map((action) => (
                      <li key={action.id}>
                        <div>
                          <strong>
                            #{action.position + 1} · {action.type}
                          </strong>
                          <span className={`action-status ${action.status.toLowerCase()}`}>
                            {action.status.toLowerCase()}
                          </span>
                          {action.detail.label ? <p>{action.detail.label}</p> : null}
                          {action.target ? <p className="muted">Target: {action.target}</p> : null}
                          {action.detail.beforeUrl || action.detail.afterUrl ? (
                            <p className="muted">
                              {action.detail.beforeUrl ?? 'Unknown location'} →{' '}
                              {action.detail.afterUrl ?? 'Unknown location'}
                            </p>
                          ) : null}
                          {action.detail.reason ? (
                            <p className="muted">Outcome: {action.detail.reason}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          )}
          <h2>Candidate findings</h2>
          {run.findings.length === 0 ? (
            <p className="muted">No candidate findings were recorded.</p>
          ) : (
            <ol className="run-list detail-runs">
              {run.findings.map((finding) => (
                <li key={finding.id}>
                  <div>
                    {(() => {
                      const report = parseFindingReport(finding.description);
                      return (
                        <>
                          <strong>{finding.title}</strong>
                          <time>{formatDate(finding.createdAt)}</time>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              margin: '4px 0',
                            }}
                          >
                            <span className={`run-status ${finding.status.toLowerCase()}`}>
                              {finding.status === 'VERIFIED'
                                ? 'Verified finding'
                                : 'Candidate finding'}
                            </span>
                            {finding.status === 'CANDIDATE' ? (
                              <button
                                type="button"
                                className="secondary-button small-button"
                                onClick={() => verifyFinding(finding.id)}
                                disabled={verifyingId === finding.id}
                              >
                                {verifyingId === finding.id ? 'Verifying…' : 'Verify finding'}
                              </button>
                            ) : null}
                          </div>
                          {report ? (
                            <>
                              <p>{report.summary}</p>
                              <p className="muted">
                                {report.category} · severity {report.severity} · confidence{' '}
                                {report.confidence}
                              </p>
                              <p className="muted">Affected page: {report.affectedUrl}</p>
                              <p className="muted">Expected: {report.expected}</p>
                              <p className="muted">Actual: {report.actual}</p>
                              <p className="muted">Why this is a candidate: {report.rationale}</p>
                              {report.reproductionSteps?.length ? (
                                <ol>
                                  {report.reproductionSteps.map((step) => (
                                    <li key={step}>{step}</li>
                                  ))}
                                </ol>
                              ) : null}
                              {report.evidence?.length ? (
                                <details>
                                  <summary>Sanitized evidence</summary>
                                  {report.evidence.map((item) => (
                                    <p key={`${item.kind}:${item.detail}`}>
                                      {item.kind}: {item.detail}
                                    </p>
                                  ))}
                                </details>
                              ) : null}
                            </>
                          ) : finding.description ? (
                            <p className="muted">
                              Finding details are unavailable for this older run.
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {run.artifacts
            .filter((artifact) => artifact.contentType === 'image/png')
            .map((artifact) => (
              <img
                className="screenshot"
                key={artifact.id}
                src={`/api/runs/${run.id}/artifacts/${artifact.id}`}
                alt="Captured browser screenshot"
              />
            ))}
        </section>
      ) : (
        <p className="feedback error" role="alert">
          {message}
        </p>
      )}
    </main>
  );
}
