export interface TopologyNode {
  id: string;
  name: string;
  slug: string;
  tier: 'T1' | 'T2' | 'T3' | string;
  healthScore: number;
  dependsOnServiceIds: string[];
  dependedOnByServiceIds: string[];
}

export interface ImpactAnalysis {
  targetServiceId: string;
  targetServiceName: string;
  blastRadiusScore: number; // 0–100
  impactLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  directDependenciesCount: number;
  downstreamImpactedCount: number;
  upstreamImpactedCount: number;
  downstreamServices: string[];
  upstreamServices: string[];
}

export class ImpactAnalyzer {
  analyzeImpact(
    targetServiceId: string,
    allNodes: Map<string, TopologyNode>
  ): ImpactAnalysis {
    const targetNode = allNodes.get(targetServiceId);
    if (!targetNode) {
      return {
        targetServiceId,
        targetServiceName: 'Unknown Service',
        blastRadiusScore: 0,
        impactLevel: 'LOW',
        directDependenciesCount: 0,
        downstreamImpactedCount: 0,
        upstreamImpactedCount: 0,
        downstreamServices: [],
        upstreamServices: [],
      };
    }

    // Traverse upstream (services that target Node depends on)
    const upstream = new Set<string>();
    this.traverseGraph(targetNode.dependsOnServiceIds, allNodes, upstream, 'upstream');

    // Traverse downstream (services that depend on target Node)
    const downstream = new Set<string>();
    this.traverseGraph(targetNode.dependedOnByServiceIds, allNodes, downstream, 'downstream');

    // Calculate quantitative blast radius score (0-100)
    let score = 0;
    // Tier criticality weight
    if (targetNode.tier === 'T1' || targetNode.tier === '1') score += 40;
    else if (targetNode.tier === 'T2' || targetNode.tier === '2') score += 25;
    else score += 10;

    // Downstream blast radius weight (5 pts per downstream service, max 40)
    score += Math.min(40, downstream.size * 10);

    // Upstream dependency weight (3 pts per upstream dependency, max 20)
    score += Math.min(20, upstream.size * 5);

    score = Math.min(100, score);

    let impactLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (score >= 75) impactLevel = 'CRITICAL';
    else if (score >= 50) impactLevel = 'HIGH';
    else if (score >= 25) impactLevel = 'MEDIUM';

    return {
      targetServiceId,
      targetServiceName: targetNode.name,
      blastRadiusScore: score,
      impactLevel,
      directDependenciesCount: targetNode.dependsOnServiceIds.length,
      downstreamImpactedCount: downstream.size,
      upstreamImpactedCount: upstream.size,
      downstreamServices: Array.from(downstream),
      upstreamServices: Array.from(upstream),
    };
  }

  private traverseGraph(
    startIds: string[],
    allNodes: Map<string, TopologyNode>,
    visited: Set<string>,
    direction: 'upstream' | 'downstream'
  ): void {
    for (const id of startIds) {
      if (visited.has(id)) continue;
      visited.add(id);

      const node = allNodes.get(id);
      if (!node) continue;

      const nextIds = direction === 'upstream' ? node.dependsOnServiceIds : node.dependedOnByServiceIds;
      this.traverseGraph(nextIds, allNodes, visited, direction);
    }
  }
}
