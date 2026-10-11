'use client';

import React from 'react';

type TopbarProps = {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onNewTargetClick?: () => void;
  onToggleSidebar?: () => void;
};

export function Topbar({
  searchQuery = '',
  onSearchChange,
  onNewTargetClick,
  onToggleSidebar,
}: TopbarProps) {
  return (
    <header className="app-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button
          type="button"
          className="menu-toggle-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        <div className="topbar-search">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)">
            <circle cx="11" cy="11" r="8" strokeWidth={2} />
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth={2} />
          </svg>
          <input
            type="search"
            placeholder="Search anything…"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
          <span className="search-shortcut">⌘K</span>
        </div>
      </div>

      <div className="topbar-actions">
        {onNewTargetClick ? (
          <button type="button" className="btn-primary btn-sm" onClick={onNewTargetClick}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>New Target</span>
          </button>
        ) : (
          <a href="/?new=1" className="btn-primary btn-sm">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>New Target</span>
          </a>
        )}

        <div className="topbar-user">
          <div className="user-avatar">A</div>
          <span className="user-name">Arin Docs</span>
        </div>
      </div>
    </header>
  );
}
