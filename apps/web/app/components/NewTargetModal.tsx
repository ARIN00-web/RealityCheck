'use client';

import React, { FormEvent, useEffect, useState } from 'react';

type NewTargetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (targetUrl: string) => void;
};

export function NewTargetModal({ isOpen, onClose, onSuccess }: NewTargetModalProps) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/target', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message ?? 'Unable to register target URL.');
      }
      setUrl('');
      onSuccess(data.url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register target URL.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2
              id="modal-title"
              style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '4px', color: '#fff' }}
            >
              Register Target Website
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
              Add a web application URL to start automated exploration.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
            }}
            aria-label="Close dialog"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

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

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="modal-target-url">
              Website URL
            </label>
            <input
              id="modal-target-url"
              className="form-input"
              type="url"
              placeholder="https://your-app.example or http://localhost:8088/fixture.html"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              autoFocus
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Only HTTP and HTTPS URLs are accepted.
            </span>
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}
          >
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !url.trim()}>
              {submitting ? 'Registering…' : 'Add Target'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
