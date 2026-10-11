'use client';

import React from 'react';

type BrowserMockupProps = {
  url: string;
  screenshotUrl?: string | null;
  children?: React.ReactNode;
  height?: string | number;
};

export function BrowserMockup({ url, screenshotUrl, children, height = 340 }: BrowserMockupProps) {
  return (
    <div className="browser-mockup" style={{ width: '100%' }}>
      <div className="browser-mockup-header">
        <div className="browser-dots">
          <div className="browser-dot red" />
          <div className="browser-dot yellow" />
          <div className="browser-dot green" />
        </div>
        <div className="browser-address-bar">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="3" y="11" width="18" height="11" rx="2" strokeWidth={2} />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeWidth={2} />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {url || 'about:blank'}
          </span>
        </div>
      </div>
      <div
        className="browser-viewport"
        style={{ minHeight: typeof height === 'number' ? `${height}px` : height, padding: '16px' }}
      >
        {screenshotUrl ? (
          <img src={screenshotUrl} alt="Browser Replay Output" className="browser-screenshot-img" />
        ) : children ? (
          children
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
            <svg
              width="44"
              height="44"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              style={{ margin: '0 auto 12px', opacity: 0.4 }}
            >
              <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth={1.5} />
              <line x1="8" y1="21" x2="16" y2="21" strokeWidth={1.5} />
              <line x1="12" y1="17" x2="12" y2="21" strokeWidth={1.5} />
            </svg>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>No screenshot captured for this state</p>
          </div>
        )}
      </div>
    </div>
  );
}
