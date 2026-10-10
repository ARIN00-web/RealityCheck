'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDate, targetLabel, type DashboardTarget } from '../../dashboard-utils';

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
  const [message, setMessage] = useState('Loading target history…');
  const [starting, setStarting] = useState(false);

  const loadTarget = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/targets/${params.id}`);
      if (response.status === 404) {
        setMessage('This target no longer exists.');
        return;
      }
      if (!response.ok) {
        throw new Error('Unable to load this target history.');
      }
      setTarget(await response.json());
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
        </section>
      ) : (
        <p className="feedback error" role="alert">
          {message}
        </p>
      )}
    </main>
  );
}
