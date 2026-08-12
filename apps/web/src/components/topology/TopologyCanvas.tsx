import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  MiniMap,
  Node,
  Edge,
  BackgroundVariant,
  Panel,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EstateComponentNode } from './EstateComponentNode';
import { TransactionFlowEdge } from './TransactionFlowEdge';
import { EstateNode, EstateEdge, EstateTopologyResponse, EstateChaosScenario, BlastRadiusInfo } from '@opspilot/types';
import { Flame, ShieldAlert, Target, RotateCcw, Activity } from 'lucide-react';

interface TopologyCanvasProps {
  topology: EstateTopologyResponse;
  isPaused: boolean;
  filter: 'ALL' | 'GREEN' | 'AMBER' | 'RED';
  selectedComponentId: string | null;
  onSelectComponent: (id: string | null) => void;
  activeScenario?: EstateChaosScenario | null;
  blastRadius?: BlastRadiusInfo | null;
}

const nodeTypes = {
  estateComponent: EstateComponentNode,
};

const edgeTypes = {
  transactionFlow: TransactionFlowEdge,
};

function InnerTopologyCanvas({
  topology,
  isPaused,
  filter,
  selectedComponentId,
  onSelectComponent,
  activeScenario,
  blastRadius,
}: TopologyCanvasProps) {
  const { setCenter, fitView } = useReactFlow();

  // Calculate RAG & Blast Radius Contextual Highlight Sets
  const { targetNodeIds, contextNodeIds } = useMemo(() => {
    const targets = new Set<string>();
    const contexts = new Set<string>();

    if (activeScenario) {
      targets.add(activeScenario.targetComponentId);
      if (blastRadius?.affectedComponentIds) {
        blastRadius.affectedComponentIds.forEach((id) => contexts.add(id));
      }
    } else if (filter !== 'ALL') {
      topology.nodes.forEach((n) => {
        if (n.health === filter) {
          targets.add(n.id);
        }
      });

      topology.edges.forEach((edge) => {
        if (targets.has(edge.source)) contexts.add(edge.target);
        if (targets.has(edge.target)) contexts.add(edge.source);
      });
    }

    return { targetNodeIds: targets, contextNodeIds: contexts };
  }, [topology.nodes, topology.edges, filter, activeScenario, blastRadius]);

  const nodes: Node[] = useMemo(() => {
    return topology.nodes.map((node: EstateNode) => {
      let isDimmed = false;
      let isContextHighlighted = false;

      if (activeScenario || filter !== 'ALL') {
        const isTarget = targetNodeIds.has(node.id);
        const isContext = contextNodeIds.has(node.id);

        if (!isTarget && !isContext) {
          isDimmed = true;
        } else if (isContext && !isTarget) {
          isContextHighlighted = true;
        }
      }

      return {
        id: node.id,
        type: 'estateComponent',
        position: node.position,
        data: {
          node,
          isDimmed,
          isContextHighlighted,
        },
        selected: node.id === selectedComponentId,
      };
    });
  }, [topology.nodes, filter, targetNodeIds, contextNodeIds, selectedComponentId, activeScenario]);

  const edges: Edge[] = useMemo(() => {
    return topology.edges.map((edge: EstateEdge) => {
      let isDimmed = false;
      let isContextHighlighted = false;

      if (activeScenario || filter !== 'ALL') {
        const srcIsTarget = targetNodeIds.has(edge.source);
        const tgtIsTarget = targetNodeIds.has(edge.target);
        const srcIsContext = contextNodeIds.has(edge.source);
        const tgtIsContext = contextNodeIds.has(edge.target);

        if (srcIsTarget || tgtIsTarget) {
          isContextHighlighted = true;
        } else if (!srcIsContext && !tgtIsContext) {
          isDimmed = true;
        }
      }

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'transactionFlow',
        data: {
          health: edge.health,
          throughputRps: edge.throughputRps,
          transactionType: edge.transactionType,
          isPaused,
          isDimmed,
          isContextHighlighted,
        },
      };
    });
  }, [topology.edges, filter, targetNodeIds, contextNodeIds, isPaused, activeScenario]);

  // Focus Incident action: automatically pan/zoom to affected component
  const handleFocusIncident = useCallback(() => {
    const targetId = activeScenario?.targetComponentId ?? blastRadius?.rootCauseComponentId ?? 'payments-service';
    const targetNode = topology.nodes.find((n) => n.id === targetId || n.id.includes(targetId));

    if (targetNode) {
      setCenter(targetNode.position.x + 90, targetNode.position.y + 40, { zoom: 1.4, duration: 1000 });
      onSelectComponent(targetNode.id);
    } else {
      fitView({ duration: 800 });
    }
  }, [activeScenario, blastRadius, topology.nodes, setCenter, onSelectComponent, fitView]);

  return (
    <div className="relative w-full h-[520px] rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_event, node) => onSelectComponent(node.id)}
        onPaneClick={() => onSelectComponent(null)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={{ type: 'transactionFlow' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#334155" />
        <Controls className="!bg-slate-900 !border-slate-800 !text-slate-200 !rounded-lg overflow-hidden shadow-lg" />
        <MiniMap
          nodeColor={(node) => {
            const health = (node.data?.node as any)?.health;
            if (health === 'RED') return '#f43f5e';
            if (health === 'AMBER') return '#f59e0b';
            return '#10b981';
          }}
          className="!bg-slate-900/90 !border-slate-800 !rounded-lg shadow-xl"
          maskColor="rgba(15, 23, 42, 0.75)"
        />

        {/* Logical Architecture Layer Bands Panel */}
        <Panel position="top-left" className="bg-slate-900/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1.5 shadow-xl">
          <div className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center justify-between border-b border-slate-800 pb-1 mb-2">
            <span>Architecture Layers</span>
            <span className="text-[10px] text-slate-400 font-mono font-normal">Top → Bottom</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span className="font-medium text-slate-200">1. Channels & Digital</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
            <span className="font-medium text-slate-200">2. API & Integration</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="font-medium text-slate-200">3. Business Services</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            <span className="font-medium text-slate-200">4. Data & Storage</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            <span className="font-medium text-slate-200">5. External Dependencies</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="font-medium text-slate-200">6. Platform & Infrastructure</span>
          </div>
        </Panel>

        {/* Active Incident & Blast Radius Dynamic HUD Banner */}
        {(activeScenario || topology.summary.redCount > 0) && (
          <Panel position="top-right" className="bg-slate-900/95 backdrop-blur-xl p-3.5 rounded-xl border border-rose-500/40 text-xs text-slate-200 space-y-2 shadow-2xl max-w-sm animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center justify-between border-b border-rose-500/30 pb-1.5">
              <div className="flex items-center gap-1.5 font-bold text-rose-300 text-xs uppercase tracking-wide">
                <Flame className="w-4 h-4 text-rose-400 animate-bounce" />
                <span>ACTIVE INCIDENT & BLAST RADIUS</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/50 font-mono text-[10px] font-bold">
                {activeScenario?.riskLevel ?? 'HIGH RISK'}
              </span>
            </div>

            <div>
              <h3 className="font-bold text-white text-sm">
                {activeScenario?.name ?? 'Critical Degradation Incident'}
              </h3>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {activeScenario?.description ?? 'High latency and error rate propagation along active transaction paths.'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px] bg-slate-950/80 p-2 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400 block font-sans text-[9px] uppercase">Impacted</span>
                <span className="text-white font-bold text-xs">{blastRadius?.totalImpactedComponentsCount ?? 4} nodes</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans text-[9px] uppercase">Affected RPS</span>
                <span className="text-amber-400 font-bold text-xs">{(blastRadius?.totalImpactedRps ?? 1840).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans text-[9px] uppercase">Blast Radius</span>
                <span className="text-rose-400 font-bold text-xs">{blastRadius?.riskLevel ?? 'HIGH'}</span>
              </div>
            </div>

            {/* FOCUS INCIDENT Button */}
            <button
              onClick={handleFocusIncident}
              className="w-full py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
            >
              <Target className="w-3.5 h-3.5" /> FOCUS INCIDENT & ZOOM TO ROOT CAUSE
            </button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export function TopologyCanvas(props: TopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerTopologyCanvas {...props} />
    </ReactFlowProvider>
  );
}
