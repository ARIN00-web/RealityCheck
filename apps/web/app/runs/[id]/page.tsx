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
};

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [message, setMessage] = useState('Loading run details…');

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
          <h2>Candidate findings</h2>
          {run.findings.length === 0 ? (
            <p className="muted">No candidate findings were recorded.</p>
          ) : (
            <ol className="run-list detail-runs">
              {run.findings.map((finding) => (
                <li key={finding.id}>
                  <div>
                    <strong>{finding.title}</strong>
                    <time>{formatDate(finding.createdAt)}</time>
                    <p className="muted">
                      {finding.status.replaceAll('_', ' ')} — candidate, not confirmed
                    </p>
                    {finding.description ? <p className="muted">{finding.description}</p> : null}
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
