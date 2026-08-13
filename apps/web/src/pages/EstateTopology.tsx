import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CommandCenterControlHeader } from '@/components/topology/CommandCenterControlHeader';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { ComponentDetailDrawer } from '@/components/topology/ComponentDetailDrawer';
import { LiveEstateActivitySection } from '@/components/topology/LiveEstateActivitySection';
import { EstateTopologyResponse, EstateChaosScenario, BlastRadiusInfo } from '@opspilot/types';

export function EstateTopology() {
  const [searchParams] = useSearchParams();
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [filter, setFilter] = useState<'ALL' | 'GREEN' | 'AMBER' | 'RED'>('ALL');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(searchParams.get('selected'));
  const [activeScenario, setActiveScenario] = useState<EstateChaosScenario | null>(null);

  useEffect(() => {
    const sel = searchParams.get('selected');
    if (sel) {
      setSelectedComponentId(sel);
    }
  }, [searchParams]);

  const { data: topologyData, isLoading } = useQuery({
    queryKey: ['topology'],
    queryFn: async () => {
      const res = await api.topology.getTopology();
      return res.data;
    },
    refetchInterval: 5000,
  });

  // Calculate simulated scenario overlay on top of real OTel topology if scenario active
  const { topology, blastRadius } = useMemo(() => {
    const rawTopo: EstateTopologyResponse | undefined = topologyData;
    if (!rawTopo) {
      return { topology: undefined, blastRadius: null };
    }

    if (!activeScenario) {
      return { topology: rawTopo, blastRadius: null };
    }

    // Apply active scenario overlay
    const targetId = activeScenario.targetComponentId;

    // Downstream dependency propagation
    const downstream = new Set<string>();
    const queue = [targetId];
    const visited = new Set<string>([targetId]);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const edges = rawTopo.edges.filter((e) => e.source === curr);
      for (const e of edges) {
        if (!visited.has(e.target)) {
          visited.add(e.target);
          downstream.add(e.target);
          queue.push(e.target);
        }
      }
    }

    // Direct Upstream
    const upstream = new Set<string>();
    rawTopo.edges.filter((e) => e.target === targetId).forEach((e) => upstream.add(e.source));

    let redCount = 0;
    let amberCount = 0;
    let greenCount = 0;

    const modifiedNodes = rawTopo.nodes.map((node) => {
      if (node.id === targetId || node.id.includes(targetId)) {
        redCount++;
        return {
          ...node,
          health: activeScenario.health,
          activeIncidentCount: node.activeIncidentCount + 1,
          metrics: {
            ...node.metrics,
            latencyP99Ms: activeScenario.metricsOverride.latencyP99Ms ?? node.metrics.latencyP99Ms,
            errorRatePercent: activeScenario.metricsOverride.errorRatePercent ?? node.metrics.errorRatePercent,
            cpuPercent: activeScenario.metricsOverride.cpuPercent ?? node.metrics.cpuPercent,
          },
        };
      }

      if (downstream.has(node.id) || activeScenario.expectedDownstreamImpact.some((imp) => node.id.includes(imp))) {
        amberCount++;
        return {
          ...node,
          health: 'AMBER' as const,
          metrics: {
            ...node.metrics,
            latencyP99Ms: Math.round(node.metrics.latencyP99Ms * 2.5),
            errorRatePercent: parseFloat((node.metrics.errorRatePercent + 3.5).toFixed(1)),
          },
        };
      }

      if (node.health === 'RED') redCount++;
      else if (node.health === 'AMBER') amberCount++;
      else greenCount++;

      return node;
    });

    const modifiedEdges = rawTopo.edges.map((edge) => {
      if (edge.source === targetId || edge.target === targetId) {
        return { ...edge, health: 'RED' as const };
      }
      if (downstream.has(edge.source) || downstream.has(edge.target)) {
        return { ...edge, health: 'AMBER' as const };
      }
      return edge;
    });

    const totalImpactedCount = 1 + downstream.size + upstream.size;
    let totalImpactedRps = rawTopo.nodes.find((n) => n.id === targetId)?.metrics.throughputRps ?? 850;
    downstream.forEach((id) => {
      const n = rawTopo.nodes.find((item) => item.id === id);
      if (n) totalImpactedRps += n.metrics.throughputRps;
    });

    const calcBlastRadius: BlastRadiusInfo = {
      rootCauseComponentId: targetId,
      rootCauseComponentName: activeScenario.targetComponentName,
      directImpactCount: upstream.size,
      downstreamImpactCount: downstream.size,
      upstreamImpactCount: upstream.size,
      totalImpactedComponentsCount: totalImpactedCount,
      totalImpactedRps: Math.round(totalImpactedRps),
      riskLevel: activeScenario.riskLevel,
      affectedComponentIds: Array.from(visited).concat(Array.from(upstream)),
    };

    return {
      topology: {
        summary: {
          ...rawTopo.summary,
          redCount: Math.max(rawTopo.summary.redCount, redCount),
          amberCount: Math.max(rawTopo.summary.amberCount, amberCount),
          greenCount: Math.max(0, rawTopo.summary.totalComponents - redCount - amberCount),
          activeIncidents: rawTopo.summary.activeIncidents + 1,
        },
        nodes: modifiedNodes,
        edges: modifiedEdges,
      },
      blastRadius: calcBlastRadius,
    };
  }, [topologyData, activeScenario]);

  const handleSelectScenario = async (scenario: EstateChaosScenario | null) => {
    setActiveScenario(scenario);
    if (scenario) {
      // Also notify backend API telemetry provider override
      try {
        await fetch('/api/v1/telemetry/demo/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceName: scenario.targetComponentName,
            latencyP99: scenario.metricsOverride.latencyP99Ms,
            errorRate: scenario.metricsOverride.errorRatePercent,
            rps: scenario.metricsOverride.throughputRps,
          }),
        });
      } catch {
        // Ignore API override error
      }
    }
  };

  return (
    <div className="space-y-4.5 fade-in">
      {/* Control Header Strip */}
      <CommandCenterControlHeader
        summary={topology?.summary}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused((prev) => !prev)}
        filter={filter}
        onFilterChange={(f) => setFilter(f)}
        activeScenario={activeScenario}
        onSelectScenario={handleSelectScenario}
      />

      {/* Main Estate Topology Canvas */}
      {isLoading && !topology ? (
        <div className="h-[520px] rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center text-slate-400">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading Living Estate Command Center...</span>
          </div>
        </div>
      ) : (
        <TopologyCanvas
          topology={
            topology ?? {
              summary: {
                totalComponents: 0,
                greenCount: 0,
                amberCount: 0,
                redCount: 0,
                unknownCount: 0,
                activeIncidents: 0,
                totalRps: 0,
                telemetryProvider: 'OTEL',
                telemetryStatus: 'HEALTHY',
                lastUpdated: new Date().toISOString(),
              },
              nodes: [],
              edges: [],
            }
          }
          isPaused={isPaused}
          filter={filter}
          selectedComponentId={selectedComponentId}
          onSelectComponent={(id) => setSelectedComponentId(id)}
          activeScenario={activeScenario}
          blastRadius={blastRadius}
        />
      )}

      {/* Bottom Live Estate Activity Operational HUD Section */}
      <LiveEstateActivitySection
        summary={topology?.summary}
        activeScenario={activeScenario}
        blastRadius={blastRadius}
      />

      {/* Component Detail Drill-down Side Drawer */}
      <ComponentDetailDrawer
        componentId={selectedComponentId}
        topologyNode={topology?.nodes.find((n) => n.id === selectedComponentId)}
        activeScenario={activeScenario}
        onClose={() => setSelectedComponentId(null)}
        onSelectComponent={(id) => setSelectedComponentId(id)}
      />
    </div>
  );
}
