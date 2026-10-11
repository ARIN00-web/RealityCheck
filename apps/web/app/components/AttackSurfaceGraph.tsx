'use client';

import React, { useState } from 'react';

type NodeItem = {
  id: string;
  label: string;
  category: string;
  x: number;
  y: number;
  severity?: 'high' | 'medium' | 'low';
  type: 'target' | 'finding';
};

export function AttackSurfaceGraph({
  targetsCount = 4,
  findingsCount = 8,
}: {
  targetsCount?: number;
  findingsCount?: number;
}) {
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);

  // Nodes arranged in an aesthetic cosmic layout
  const nodes: NodeItem[] = [
    { id: 'target-1', label: 'localhost:8088', category: 'Target', x: 260, y: 190, type: 'target' },
    {
      id: 'f-1',
      label: 'Page Error',
      category: 'page_error',
      x: 130,
      y: 110,
      severity: 'high',
      type: 'finding',
    },
    {
      id: 'f-2',
      label: 'State Sync Invariant',
      category: 'page_error',
      x: 390,
      y: 100,
      severity: 'high',
      type: 'finding',
    },
    {
      id: 'f-3',
      label: 'HTTP 401 Auth',
      category: 'http_error',
      x: 110,
      y: 270,
      severity: 'medium',
      type: 'finding',
    },
    {
      id: 'f-4',
      label: 'HTTP 503 Outage',
      category: 'http_error',
      x: 380,
      y: 280,
      severity: 'medium',
      type: 'finding',
    },
    {
      id: 'f-5',
      label: 'Network Timeout',
      category: 'network_error',
      x: 260,
      y: 320,
      severity: 'low',
      type: 'finding',
    },
    {
      id: 'f-6',
      label: 'XSS Vector',
      category: 'page_error',
      x: 260,
      y: 60,
      severity: 'high',
      type: 'finding',
    },
  ];

  const edges = [
    { from: 'target-1', to: 'f-1' },
    { from: 'target-1', to: 'f-2' },
    { from: 'target-1', to: 'f-3' },
    { from: 'target-1', to: 'f-4' },
    { from: 'target-1', to: 'f-5' },
    { from: 'target-1', to: 'f-6' },
  ];

  return (
    <div className="attack-surface-container" style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '20px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', margin: '0 0 2px' }}>
            Interactive Finding Relationship Graph
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
            Attack surface nodes connected to verified exploration paths
          </p>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '20px',
          zIndex: 10,
          display: 'flex',
          gap: '12px',
          fontSize: '0.75rem',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff4d6d' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4d6d' }} /> High
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />{' '}
          Medium
        </span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--cyan-accent)' }}
        >
          <span
            style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cyan-accent)' }}
          />{' '}
          Low
        </span>
      </div>

      <svg width="100%" height="100%" viewBox="0 0 520 380" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="targetGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff1493" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#9d4edd" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0b0314" stopOpacity="0" />
          </radialGradient>
          <filter id="glowFilter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Orbit grid lines */}
        <circle
          cx="260"
          cy="190"
          r="140"
          fill="none"
          stroke="rgba(157, 78, 221, 0.15)"
          strokeDasharray="4 6"
        />
        <circle
          cx="260"
          cy="190"
          r="90"
          fill="none"
          stroke="rgba(255, 20, 147, 0.12)"
          strokeDasharray="3 5"
        />

        {/* Connecting Edges */}
        {edges.map((edge) => {
          const fromNode = nodes.find((n) => n.id === edge.from)!;
          const toNode = nodes.find((n) => n.id === edge.to)!;
          const isHighlighted = selectedNode?.id === toNode.id;
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={isHighlighted ? '#ff1493' : 'rgba(157, 78, 221, 0.45)'}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
                strokeDasharray={isHighlighted ? 'none' : '4 4'}
                filter={isHighlighted ? 'url(#glowFilter)' : undefined}
                style={{ transition: 'all 0.3s ease' }}
              />
              <circle
                cx={(fromNode.x + toNode.x) / 2}
                cy={(fromNode.y + toNode.y) / 2}
                r="2"
                fill="#ff1493"
                opacity="0.8"
              />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isTarget = node.type === 'target';
          const isSelected = selectedNode?.id === node.id;
          const nodeColor = isTarget
            ? '#ff1493'
            : node.severity === 'high'
              ? '#ff4d6d'
              : node.severity === 'medium'
                ? '#fbbf24'
                : 'var(--cyan-accent)';

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => setSelectedNode(node)}
              onMouseEnter={() => setSelectedNode(node)}
              style={{ cursor: 'pointer' }}
            >
              {/* Outer pulse aura */}
              <circle
                r={isTarget ? 38 : 22}
                fill={nodeColor}
                opacity={isSelected ? 0.35 : 0.15}
                style={{ transition: 'all 0.25s ease' }}
              />
              {/* Center node */}
              <circle
                r={isTarget ? 24 : 14}
                fill="#120624"
                stroke={nodeColor}
                strokeWidth={isSelected ? 3 : 2}
                filter="url(#glowFilter)"
              />
              <text
                textAnchor="middle"
                dy={isTarget ? 38 : 28}
                fill="#ffffff"
                fontSize={isTarget ? '11px' : '9.5px'}
                fontWeight={700}
                style={{ pointerEvents: 'none', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Info Card */}
      {selectedNode && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '20px',
            right: '20px',
            background: 'rgba(20, 7, 36, 0.92)',
            border: '1px solid rgba(255, 20, 147, 0.4)',
            borderRadius: '12px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 25px rgba(255, 20, 147, 0.25)',
            animation: 'fade-in 0.2s ease',
          }}
        >
          <div>
            <strong style={{ color: '#fff', fontSize: '0.92rem' }}>{selectedNode.label}</strong>
            <span
              style={{
                marginLeft: '10px',
                fontSize: '0.75rem',
                color: 'var(--lavender-muted)',
                textTransform: 'uppercase',
              }}
            >
              {selectedNode.category}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 20, 147, 0.2)',
              color: '#ff77b8',
            }}
          >
            Connected to 1 Target
          </span>
        </div>
      )}
    </div>
  );
}
