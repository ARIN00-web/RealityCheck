'use client';

import React from 'react';

type SidebarProps = {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({
  activeTab = 'dashboard',
  onSelectTab,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      href: '/',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      id: 'targets',
      label: 'Targets',
      href: '/?tab=targets',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      ),
    },
    {
      id: 'runs',
      label: 'Runs',
      href: '/?tab=runs',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8}>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
    },
    {
      id: 'findings',
      label: 'Findings',
      href: '/?tab=findings',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      ),
    },
    {
      id: 'regressions',
      label: 'Regression Tests',
      href: '/?tab=regressions',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8}>
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      ),
    },
    {
      id: 'analytics',
      label: 'Analytics',
      href: '/?tab=analytics',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
  ];

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="brand-shield">R</div>
          <span className="brand-text">RealityCheck</span>
        </a>
      </div>

      <ul className="nav-menu">
        {navItems.map((item) => (
          <li key={item.id}>
            {onSelectTab ? (
              <button
                type="button"
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => {
                  onSelectTab(item.id);
                  if (onClose) onClose();
                }}
                style={{ width: '100%', textAlign: 'left', background: 'none' }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ) : (
              <a
                href={item.href}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={onClose}
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            )}
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <div className="system-status-chip">
          <span className="pulse-dot" />
          <span>Worker & Engine Active</span>
        </div>
      </div>
    </aside>
  );
}
