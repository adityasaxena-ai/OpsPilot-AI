import React, { memo } from 'react';
import { EdgeProps, getSmoothStepPath } from '@xyflow/react';

export const TransactionFlowEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: EdgeProps) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
  });

  const health = (data?.health as string) ?? 'GREEN';
  const isPaused = Boolean(data?.isPaused);
  const isDimmed = Boolean(data?.isDimmed);
  const isContextHighlighted = Boolean(data?.isContextHighlighted);
  const rps = (data?.throughputRps as number) ?? 100;

  // Particle animation duration scales inversely with throughput RPS
  const durationSec = Math.max(0.7, Math.min(3.6, 300 / (rps || 50)));

  // Dynamic stroke thickness based on throughput RPS
  const strokeWidth = health === 'RED' ? 3.0 : Math.max(1.5, Math.min(3.8, 1.2 + (rps / 1000)));

  const strokeColor = {
    GREEN: '#10b981',
    AMBER: '#f59e0b',
    RED: '#f43f5e',
    UNKNOWN: '#64748b',
  }[health] ?? '#10b981';

  return (
    <>
      {/* Target Marker Arrow definition for clear directional flow */}
      <defs>
        <marker
          id={`arrow-${health}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill={strokeColor} opacity={isDimmed ? 0.2 : 0.85} />
        </marker>
      </defs>

      {/* Background base path */}
      <path
        id={id}
        className="react-flow__edge-path transition-all"
        d={edgePath}
        markerEnd={`url(#arrow-${health})`}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          opacity: isDimmed ? 0.08 : isContextHighlighted ? 1.0 : health === 'RED' ? 0.95 : 0.45,
        }}
      />

      {/* Primary Animated Flow Particle Dash */}
      {!isPaused && (
        <path
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 1.2}
          strokeDasharray={health === 'RED' ? '3 14' : health === 'AMBER' ? '6 12' : rps > 1000 ? '10 10' : '6 14'}
          className="animate-flow-dash transition-all"
          style={{
            opacity: isDimmed ? 0.05 : isContextHighlighted ? 1.0 : 0.85,
            animationDuration: `${durationSec}s`,
          }}
        />
      )}

      {/* Secondary Particle Trail for High-Volume Connections (>500 RPS) */}
      {!isPaused && rps > 500 && !isDimmed && (
        <path
          d={edgePath}
          fill="none"
          stroke={health === 'RED' ? '#f43f5e' : '#60a5fa'}
          strokeWidth={strokeWidth - 0.5}
          strokeDasharray="4 24"
          className="animate-flow-dash transition-all opacity-80"
          style={{
            animationDuration: `${durationSec * 0.75}s`,
          }}
        />
      )}
    </>
  );
});

TransactionFlowEdge.displayName = 'TransactionFlowEdge';
