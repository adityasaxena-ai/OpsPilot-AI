import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Globe,
  Smartphone,
  Monitor,
  Share2,
  Cpu,
  Database,
  Zap,
  Layers,
  ExternalLink,
  Shield,
  Activity,
  Server,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import { EstateNode } from '@opspilot/types';

const getNodeIcon = (type: string) => {
  switch (type) {
    case 'web-app':
      return <Globe className="w-3.5 h-3.5" />;
    case 'mobile-app':
      return <Smartphone className="w-3.5 h-3.5" />;
    case 'terminal-app':
    case 'desktop-app':
      return <Monitor className="w-3.5 h-3.5" />;
    case 'api-gateway':
      return <Share2 className="w-3.5 h-3.5" />;
    case 'microservice':
    case 'ai-service':
      return <Cpu className="w-3.5 h-3.5" />;
    case 'relational-db':
    case 'nosql-db':
    case 'graph-db':
    case 'time-series-db':
    case 'olap-db':
    case 'data-warehouse':
      return <Database className="w-3.5 h-3.5" />;
    case 'cache':
      return <Zap className="w-3.5 h-3.5" />;
    case 'message-broker':
    case 'event-stream':
      return <Layers className="w-3.5 h-3.5" />;
    case 'external-service':
      return <ExternalLink className="w-3.5 h-3.5" />;
    case 'security-proxy':
    case 'security-kms':
      return <Shield className="w-3.5 h-3.5" />;
    case 'monitoring-stack':
    case 'monitoring-agent':
      return <Activity className="w-3.5 h-3.5" />;
    default:
      return <Server className="w-3.5 h-3.5" />;
  }
};

export const EstateComponentNode = memo(({ data, selected }: NodeProps) => {
  const node = data.node as EstateNode;
  const isDimmed = Boolean(data.isDimmed);
  const isContextHighlighted = Boolean(data.isContextHighlighted);
  const health = node.health ?? 'GREEN';

  const healthStyles = {
    GREEN: {
      border: 'border-emerald-500/40 hover:border-emerald-400',
      bg: 'bg-slate-900/90',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
      badgeBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      iconColor: 'text-emerald-400',
    },
    AMBER: {
      border: 'border-amber-500/80',
      bg: 'bg-amber-950/30',
      glow: 'shadow-[0_0_22px_rgba(245,158,11,0.35)]',
      badgeBg: 'bg-amber-500/25 text-amber-300 border-amber-500/40 font-bold',
      iconColor: 'text-amber-400',
    },
    RED: {
      border: 'border-rose-500 ring-2 ring-rose-500/60',
      bg: 'bg-rose-950/40',
      glow: 'shadow-[0_0_30px_rgba(244,63,94,0.6)] animate-pulse',
      badgeBg: 'bg-rose-500/30 text-rose-200 border-rose-500/60 font-bold tracking-wider',
      iconColor: 'text-rose-400',
    },
    UNKNOWN: {
      border: 'border-slate-700',
      bg: 'bg-slate-950',
      glow: '',
      badgeBg: 'bg-slate-800 text-slate-400',
      iconColor: 'text-slate-400',
    },
  };

  const activeStyles = healthStyles[health as keyof typeof healthStyles] ?? healthStyles.GREEN;

  return (
    <div
      className={`relative w-44 rounded-xl border p-2.5 transition-all cursor-pointer backdrop-blur-md ${
        activeStyles.border
      } ${activeStyles.bg} ${activeStyles.glow} ${
        selected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-950 scale-105 z-40' : ''
      } ${isContextHighlighted ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-950 scale-[1.02] z-30' : ''} ${
        isDimmed ? 'opacity-15 grayscale pointer-events-none' : 'opacity-100'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-slate-400 !border-2 !border-slate-900" />

      {/* Header Info */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 truncate">
          <div className={`p-1 rounded-md bg-slate-800/90 ${activeStyles.iconColor}`}>
            {getNodeIcon(node.type)}
          </div>
          <span className="text-[11px] font-bold text-slate-200 truncate" title={node.name}>
            {node.name}
          </span>
        </div>

        {/* Health Status Badge */}
        <div className={`px-1.5 py-0.5 rounded text-[9px] border uppercase flex items-center gap-0.5 ${activeStyles.badgeBg}`}>
          {health === 'RED' ? (
            <>
              <Flame className="w-2.5 h-2.5 text-rose-400 animate-bounce" /> CRITICAL
            </>
          ) : health === 'AMBER' ? (
            <>
              <AlertTriangle className="w-2.5 h-2.5 text-amber-400" /> DEGRADED
            </>
          ) : (
            'OK'
          )}
        </div>
      </div>

      {/* Real-time Telemetry Metrics Pill */}
      <div className="flex items-center justify-between text-[10px] bg-slate-950/90 rounded px-1.5 py-1 border border-slate-800/80 font-mono">
        <span className="text-slate-300 font-semibold">{node.metrics.throughputRps} RPS</span>
        <span className={node.metrics.latencyP99Ms > 500 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
          {node.metrics.latencyP99Ms}ms
        </span>
        <span className={node.metrics.errorRatePercent > 1.0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
          {node.metrics.errorRatePercent.toFixed(1)}%
        </span>
      </div>

      {/* Active Incident Banner */}
      {node.activeIncidentCount > 0 && (
        <div className="mt-1.5 px-1.5 py-0.5 rounded bg-rose-500/25 border border-rose-500/50 text-[9px] text-rose-200 font-bold flex items-center justify-between shadow-sm animate-pulse">
          <span className="flex items-center gap-1">
            <Flame className="w-2.5 h-2.5 text-rose-400" /> Active Alert
          </span>
          <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded font-mono text-[9px]">
            {node.activeIncidentCount}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-slate-400 !border-2 !border-slate-900" />
    </div>
  );
});

EstateComponentNode.displayName = 'EstateComponentNode';
