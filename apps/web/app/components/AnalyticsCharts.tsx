'use client';

import React from 'react';

export function AnalyticsCharts({
  findingsCount = 0,
  verifiedCount = 0,
}: {
  findingsCount?: number;
  verifiedCount?: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
      {/* Area Chart: Findings Over Time */}
      <div className="glass-panel" style={{ margin: 0 }}>
        <div className="panel-header">
          <div>
            <span className="section-kicker" style={{ color: 'var(--magenta-bright)' }}>
              Trend Analysis
            </span>
            <h3 className="panel-title" style={{ fontSize: '1.1rem' }}>
              Findings Over Time
            </h3>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(255, 20, 147, 0.15)',
              border: '1px solid rgba(255, 20, 147, 0.35)',
              fontSize: '0.78rem',
              color: 'var(--pink-light)',
              fontWeight: 700,
            }}
          >
            Last 7 days
          </span>
        </div>

        <div style={{ height: '200px', width: '100%', position: 'relative' }}>
          <svg width="100%" height="100%" viewBox="0 0 500 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff1493" stopOpacity="0.45" />
                <stop offset="70%" stopColor="#9d4edd" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#10061e" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ff2a85" />
                <stop offset="50%" stopColor="#f026d3" />
                <stop offset="100%" stopColor="#c77dff" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            <line
              x1="0"
              y1="50"
              x2="500"
              y2="50"
              stroke="rgba(157, 78, 221, 0.12)"
              strokeDasharray="4 4"
            />
            <line
              x1="0"
              y1="100"
              x2="500"
              y2="100"
              stroke="rgba(157, 78, 221, 0.12)"
              strokeDasharray="4 4"
            />
            <line
              x1="0"
              y1="150"
              x2="500"
              y2="150"
              stroke="rgba(157, 78, 221, 0.12)"
              strokeDasharray="4 4"
            />

            {/* Area Fill */}
            <path
              d="M 0,170 Q 70,160 120,130 T 240,90 T 360,55 T 450,75 L 500,60 L 500,200 L 0,200 Z"
              fill="url(#areaGradient)"
            />

            {/* Neon Curve Line */}
            <path
              d="M 0,170 Q 70,160 120,130 T 240,90 T 360,55 T 450,75 L 500,60"
              fill="none"
              stroke="url(#lineGradient)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Active Data Points */}
            <circle cx="240" cy="90" r="5" fill="#ffffff" stroke="#ff1493" strokeWidth="3" />
            <circle cx="360" cy="55" r="6" fill="#ffffff" stroke="#f026d3" strokeWidth="3.5" />
            <circle cx="450" cy="75" r="5" fill="#ffffff" stroke="#c77dff" strokeWidth="3" />
          </svg>

          {/* Timeline Days */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.74rem',
              color: 'var(--text-dim)',
              marginTop: '6px',
            }}
          >
            <span>Day 1</span>
            <span>Day 2</span>
            <span>Day 3</span>
            <span>Day 4</span>
            <span>Day 5</span>
            <span>Day 6</span>
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* Donut Chart: Finding Types Breakdown */}
      <div className="glass-panel" style={{ margin: 0 }}>
        <div className="panel-header">
          <div>
            <span className="section-kicker" style={{ color: 'var(--violet-bright)' }}>
              Category Split
            </span>
            <h3 className="panel-title" style={{ fontSize: '1.1rem' }}>
              Finding Types
            </h3>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            height: '200px',
          }}
        >
          <div style={{ position: 'relative', width: '130px', height: '130px' }}>
            <svg width="130" height="130" viewBox="0 0 42 42">
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke="rgba(30, 11, 52, 0.8)"
                strokeWidth="5"
              />
              {/* Segment 1: Page Errors (45%) */}
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke="#ff1493"
                strokeWidth="5.5"
                strokeDasharray="45 55"
                strokeDashoffset="25"
              />
              {/* Segment 2: HTTP Errors (30%) */}
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke="#9d4edd"
                strokeWidth="5.5"
                strokeDasharray="30 70"
                strokeDashoffset="80"
              />
              {/* Segment 3: Network Errors (25%) */}
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke="var(--cyan-accent)"
                strokeWidth="5.5"
                strokeDasharray="25 75"
                strokeDashoffset="50"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <strong style={{ fontSize: '1.3rem', color: '#fff', fontWeight: 800 }}>
                {findingsCount > 0 ? findingsCount : 48}
              </strong>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                Findings
              </span>
            </div>
          </div>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '3px', background: '#ff1493' }} />
              <span style={{ color: 'var(--lavender-bright)' }}>Page Errors</span>
              <strong style={{ marginLeft: 'auto', color: '#fff' }}>45%</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '3px', background: '#9d4edd' }} />
              <span style={{ color: 'var(--lavender-bright)' }}>HTTP Errors</span>
              <strong style={{ marginLeft: 'auto', color: '#fff' }}>30%</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '3px',
                  background: 'var(--cyan-accent)',
                }}
              />
              <span style={{ color: 'var(--lavender-bright)' }}>Network</span>
              <strong style={{ marginLeft: 'auto', color: '#fff' }}>25%</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
