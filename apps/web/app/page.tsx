'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  type DashboardRun,
  type DashboardTarget,
  formatDate,
  targetLabel,
  targetsEmptyCopy,
} from './dashboard-utils';

type ApiError = { error?: { message?: string } };

export default function HomePage() {
  const [targets, setTargets] = useState<DashboardTarget[]>([]);
  const [runs, setRuns] = useState<DashboardRun[]>([]);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadDashboard(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const [targetsResponse, runsResponse] = await Promise.all([
        fetch('/api/targets'),
        fetch('/api/runs'),
      ]);
      if (!targetsResponse.ok || !runsResponse.ok) {
        throw new Error('Reality Check could not load saved QA history.');
      }
      setTargets(await targetsResponse.json());
      setRuns(await runsResponse.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
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

  return (
    <main className="dashboard-shell">
      <header className="product-header">
        <a className="brand" href="/" aria-label="Reality Check home">
          <span aria-hidden="true" className="brand-mark">
            R
          </span>
          Reality Check
        </a>
        <span className="foundation-chip">QA command center</span>
      </header>

      <section className="hero" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Adversarial quality engineering</p>
          <h1 id="dashboard-title">Know what breaks before your users do.</h1>
          <p className="summary">
            Register the websites you are responsible for. Reality Check will retain a clear,
            auditable history as automated QA capabilities are connected.
          </p>
        </div>
        <div className="signal-card" aria-label="Current workspace summary">
          <strong>{loading ? '—' : targets.length}</strong>
          <span>saved targets</span>
          <strong>{loading ? '—' : runs.length}</strong>
          <span>recorded runs</span>
        </div>
      </section>

      <section className="target-form-card" aria-labelledby="add-target-title">
        <div>
          <p className="section-kicker">Start here</p>
          <h2 id="add-target-title">Add a website target</h2>
          <p>Only HTTP and HTTPS URLs are accepted. Saving a target does not contact the site.</p>
        </div>
        <form onSubmit={submitTarget} noValidate>
          <label htmlFor="target-url">Website URL</label>
          <div className="form-row">
            <input
              id="target-url"
              name="url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://your-app.example"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-describedby="target-url-hint"
              required
            />
            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Add target'}
            </button>
          </div>
          <p id="target-url-hint" className="input-hint">
            Use a test or authorized application URL.
          </p>
        </form>
        {error ? (
          <p className="feedback error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="feedback success" role="status">
            {notice}
          </p>
        ) : null}
      </section>

      <section className="dashboard-grid">
        <section className="panel" aria-labelledby="targets-title">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Inventory</p>
              <h2 id="targets-title">Website targets</h2>
            </div>
            <span className="count">{loading ? '…' : targets.length}</span>
          </div>
          {loading ? <p className="muted">Loading saved targets…</p> : null}
          {!loading && targets.length === 0 ? (
            <div className="empty-state">
              <p>{targetsEmptyCopy(0)}</p>
            </div>
          ) : null}
          <div className="target-list">
            {targets.map((target) => (
              <article className="target-card" key={target.id}>
                <div>
                  <h3>{targetLabel(target.url)}</h3>
                  <p className="url">{target.url}</p>
                </div>
                <dl>
                  <div>
                    <dt>Runs</dt>
                    <dd>{target.runCount}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatDate(target.updatedAt)}</dd>
                  </div>
                </dl>
                <a href={`/targets/${target.id}`}>
                  View history <span aria-hidden="true">→</span>
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="panel runs-panel" aria-labelledby="runs-title">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Audit trail</p>
              <h2 id="runs-title">Recent runs</h2>
            </div>
            <span className="count">{loading ? '…' : runs.length}</span>
          </div>
          {loading ? <p className="muted">Loading run history…</p> : null}
          {!loading && runs.length === 0 ? (
            <div className="empty-state">
              <p>{targetsEmptyCopy(targets.length)}</p>
            </div>
          ) : null}
          <ol className="run-list">
            {runs.map((run) => (
              <li key={run.id}>
                <span className={`run-status ${run.status.toLowerCase()}`}>
                  {run.status.replaceAll('_', ' ')}
                </span>
                <div>
                  <strong>{targetLabel(run.target.url)}</strong>
                  <time>{formatDate(run.createdAt)}</time>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  );
}
