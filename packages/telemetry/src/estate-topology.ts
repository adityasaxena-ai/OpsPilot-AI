import {
  EstateNode,
  EstateEdge,
  EstateComponentLayer,
  ComponentHealthStatus,
  EstateTopologyResponse,
  ComponentDetail,
  EstateChaosScenario,
} from '@opspilot/types';

export class CanonicalEstateTopology {
  private nodes: EstateNode[] = [];
  private edges: EstateEdge[] = [];

  constructor() {
    this.initCanonicalTopology();
  }

  getTopology(
    liveTelemetry: Record<string, import('./provider.js').ServiceTelemetry> = {},
    activeIncidents: any[] = [],
    telemetryStatus?: { status: string; providerName: string },
  ): EstateTopologyResponse {
    // Map live telemetry & active incident alerts onto nodes
    const incidentMap = new Map<string, number>();
    for (const inc of activeIncidents) {
      if (inc.serviceName) {
        const slug = inc.serviceName.toLowerCase().replace(/\s+/g, '-');
        incidentMap.set(slug, (incidentMap.get(slug) ?? 0) + 1);
        if (inc.affectedServices && Array.isArray(inc.affectedServices)) {
          for (const aff of inc.affectedServices) {
            const affSlug = String(aff).toLowerCase().replace(/\s+/g, '-');
            incidentMap.set(affSlug, (incidentMap.get(affSlug) ?? 0) + 1);
          }
        }
      }
    }

    let greenCount = 0;
    let amberCount = 0;
    let redCount = 0;
    let unknownCount = 0;
    let totalRps = 0;

    const updatedNodes = this.nodes.map((node) => {
      const live = liveTelemetry[node.name];
      const activeIncCount = incidentMap.get(node.id) ?? incidentMap.get(node.name.toLowerCase()) ?? 0;

      let health: ComponentHealthStatus = 'GREEN';

      if (activeIncCount > 0) {
        health = 'RED';
      } else if (live) {
        if (!live.isHealthy || live.errorRatePercent > 5.0 || live.latencyP99Ms > 1500) {
          health = 'RED';
        } else if (live.errorRatePercent > 1.5 || live.latencyP99Ms > 500 || (live.cpuPercent ?? 0) > 85) {
          health = 'AMBER';
        } else {
          health = 'GREEN';
        }
      } else if (node.health === 'AMBER' || node.health === 'RED') {
        health = node.health;
      }

      const rps = live?.throughputRps ?? node.metrics.throughputRps;
      totalRps += rps;

      if (health === 'GREEN') greenCount++;
      else if (health === 'AMBER') amberCount++;
      else if (health === 'RED') redCount++;
      else unknownCount++;

      return {
        ...node,
        health,
        activeIncidentCount: activeIncCount,
        metrics: {
          ...node.metrics,
          throughputRps: rps,
          latencyP99Ms: live?.latencyP99Ms ?? node.metrics.latencyP99Ms,
          errorRatePercent: live?.errorRatePercent ?? node.metrics.errorRatePercent,
          cpuPercent: live?.cpuPercent ?? node.metrics.cpuPercent ?? 30,
          memoryPercent: live?.memoryPercent ?? node.metrics.memoryPercent ?? 40,
        },
      };
    });

    const nodeHealthMap = new Map(updatedNodes.map((n) => [n.id, n.health]));

    const updatedEdges = this.edges.map((edge) => {
      const srcHealth = nodeHealthMap.get(edge.source) ?? 'GREEN';
      const tgtHealth = nodeHealthMap.get(edge.target) ?? 'GREEN';
      let edgeHealth: ComponentHealthStatus = 'GREEN';

      if (srcHealth === 'RED' || tgtHealth === 'RED') {
        edgeHealth = 'RED';
      } else if (srcHealth === 'AMBER' || tgtHealth === 'AMBER') {
        edgeHealth = 'AMBER';
      }

      return {
        ...edge,
        health: edgeHealth,
      };
    });

    return {
      summary: {
        totalComponents: updatedNodes.length,
        greenCount,
        amberCount,
        redCount,
        unknownCount,
        activeIncidents: activeIncidents.length,
        totalRps: Math.round(totalRps),
        telemetryProvider: telemetryStatus?.providerName?.toUpperCase() ?? 'OTEL',
        telemetryStatus: telemetryStatus?.status ?? 'HEALTHY',
        lastUpdated: new Date().toISOString(),
      },
      nodes: updatedNodes,
      edges: updatedEdges,
    };
  }

  getComponentDetail(
    componentId: string,
    liveTelemetry: Record<string, import('./provider.js').ServiceTelemetry> = {},
    activeIncidents: any[] = [],
  ): ComponentDetail | null {
    const topology = this.getTopology(liveTelemetry, activeIncidents);
    const node = topology.nodes.find((n) => n.id === componentId || n.id === componentId.toLowerCase());
    if (!node) return null;

    const targetId = node.id.toLowerCase();
    const targetClean = targetId.replace(/-/g, ' ');

    const incidents = activeIncidents.filter((inc) => {
      const incServiceId = (inc.serviceId ?? inc.service?.id ?? '').toLowerCase();
      const incSlug = (inc.service?.slug ?? '').toLowerCase();
      const incName = (inc.serviceName ?? inc.service?.name ?? '').toLowerCase();

      return (
        incServiceId === targetId ||
        incSlug === targetId ||
        incName === node.name.toLowerCase() ||
        incName === targetClean ||
        (incName.length > 0 && incName.includes(targetClean))
      );
    });

    const upstreamEdges = topology.edges.filter((e) => e.target === node.id);
    const downstreamEdges = topology.edges.filter((e) => e.source === node.id);

    const upstreamDependencies = upstreamEdges.map((e) => {
      const targetNode = topology.nodes.find((n) => n.id === e.source);
      return {
        id: e.source,
        name: targetNode?.name ?? e.source,
        layer: targetNode?.layer ?? 'BUSINESS_SERVICES',
        health: targetNode?.health ?? 'GREEN',
        relationshipType: e.transactionType,
      };
    });

    const downstreamDependents = downstreamEdges.map((e) => {
      const targetNode = topology.nodes.find((n) => n.id === e.target);
      return {
        id: e.target,
        name: targetNode?.name ?? e.target,
        layer: targetNode?.layer ?? 'BUSINESS_SERVICES',
        health: targetNode?.health ?? 'GREEN',
        relationshipType: e.transactionType,
      };
    });

    // Generate recent 10-minute telemetry trends
    const now = Date.now();
    const telemetryHistory = Array.from({ length: 10 }).map((_, i) => {
      const t = new Date(now - (9 - i) * 60000).toISOString().substring(11, 16);
      const jitter = (Math.random() - 0.5) * 4;
      return {
        timestamp: t,
        rps: Math.max(10, Math.round(node.metrics.throughputRps + jitter * 5)),
        latencyP99Ms: Math.max(10, Math.round(node.metrics.latencyP99Ms + jitter * 10)),
        errorRatePercent: Math.max(0, parseFloat((node.metrics.errorRatePercent + jitter * 0.2).toFixed(2))),
        cpuPercent: Math.max(10, Math.round((node.metrics.cpuPercent ?? 30) + jitter * 2)),
        memoryPercent: Math.max(10, Math.round((node.metrics.memoryPercent ?? 40) + jitter * 1)),
      };
    });

    // Calculate blast radius for component
    const blastRadius = this.calculateBlastRadius(node.id, topology);

    return {
      node,
      activeIncidents: incidents,
      upstreamDependencies,
      downstreamDependents,
      telemetryHistory,
      blastRadius,
      transactionTypes: [
        { type: 'PAYMENTS', rps: Math.round(node.metrics.throughputRps * 0.45), percentage: 45 },
        { type: 'LOGINS', rps: Math.round(node.metrics.throughputRps * 0.25), percentage: 25 },
        { type: 'TRANSFERS', rps: Math.round(node.metrics.throughputRps * 0.15), percentage: 15 },
        { type: 'CARD_AUTH', rps: Math.round(node.metrics.throughputRps * 0.15), percentage: 15 },
      ],
    };
  }

  public calculateBlastRadius(
    rootCauseId: string,
    topology?: EstateTopologyResponse,
  ) {
    const topo = topology ?? this.getTopology();
    const rootNode = topo.nodes.find((n) => n.id === rootCauseId);
    if (!rootNode) {
      return {
        rootCauseComponentId: rootCauseId,
        rootCauseComponentName: rootCauseId,
        directImpactCount: 0,
        downstreamImpactCount: 0,
        upstreamImpactCount: 0,
        totalImpactedComponentsCount: 0,
        totalImpactedRps: 0,
        riskLevel: 'LOW' as const,
        affectedComponentIds: [],
      };
    }

    const downstream = new Set<string>();
    const upstream = new Set<string>();
    const visited = new Set<string>();

    // BFS Downstream
    const queue = [rootCauseId];
    visited.add(rootCauseId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const edges = topo.edges.filter((e) => e.source === curr);
      for (const e of edges) {
        if (!visited.has(e.target)) {
          visited.add(e.target);
          downstream.add(e.target);
          queue.push(e.target);
        }
      }
    }

    // Direct Upstream
    topo.edges.filter((e) => e.target === rootCauseId).forEach((e) => upstream.add(e.source));

    const totalImpactedCount = 1 + downstream.size + upstream.size;
    let totalRps = rootNode.metrics.throughputRps;
    downstream.forEach((id) => {
      const n = topo.nodes.find((item) => item.id === id);
      if (n) totalRps += n.metrics.throughputRps;
    });

    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' =
      totalImpactedCount > 6 ? 'CRITICAL' : totalImpactedCount > 3 ? 'HIGH' : totalImpactedCount > 1 ? 'MEDIUM' : 'LOW';

    return {
      rootCauseComponentId: rootCauseId,
      rootCauseComponentName: rootNode.name,
      directImpactCount: upstream.size,
      downstreamImpactCount: downstream.size,
      upstreamImpactCount: upstream.size,
      totalImpactedComponentsCount: totalImpactedCount,
      totalImpactedRps: Math.round(totalRps),
      riskLevel,
      affectedComponentIds: Array.from(visited).concat(Array.from(upstream)),
    };
  }

  private initCanonicalTopology(): void {
    // 25 Canonical Banking Technology Components Across 6 Logical Layers
    const rawNodes: Array<{
      id: string;
      name: string;
      layer: EstateComponentLayer;
      layerLabel: string;
      type: string;
      health: ComponentHealthStatus;
      rps: number;
      latency: number;
      error: number;
      cpu: number;
      mem: number;
      x: number;
      y: number;
    }> = [
      // ── Layer 1: CHANNELS / DIGITAL (Y: 40) ──────────────────────────────────
      { id: 'web-portal', name: 'Retail Web Portal', layer: 'CHANNELS', layerLabel: 'Channels & Digital', type: 'web-app', health: 'GREEN', rps: 185, latency: 45, error: 0.1, cpu: 32, mem: 45, x: 180, y: 40 },
      { id: 'mobile-app-ios', name: 'iOS Mobile Banking', layer: 'CHANNELS', layerLabel: 'Channels & Digital', type: 'mobile-app', health: 'GREEN', rps: 340, latency: 62, error: 0.2, cpu: 41, mem: 52, x: 450, y: 40 },
      { id: 'atm-network-gateway', name: 'ATM Terminal Gateway', layer: 'CHANNELS', layerLabel: 'Channels & Digital', type: 'terminal-app', health: 'GREEN', rps: 75, latency: 120, error: 0.05, cpu: 22, mem: 35, x: 720, y: 40 },
      { id: 'corporate-portal', name: 'Corporate Treasury Web', layer: 'CHANNELS', layerLabel: 'Channels & Digital', type: 'web-app', health: 'GREEN', rps: 60, latency: 55, error: 0.1, cpu: 28, mem: 38, x: 990, y: 40 },

      // ── Layer 2: API & INTEGRATION (Y: 150) ─────────────────────────────────
      { id: 'ingress-load-balancer', name: 'Ingress Load Balancer', layer: 'API_INTEGRATION', layerLabel: 'API & Integration', type: 'load-balancer', health: 'GREEN', rps: 1450, latency: 8, error: 0.02, cpu: 45, mem: 50, x: 180, y: 150 },
      { id: 'api-gateway', name: 'API Gateway', layer: 'API_INTEGRATION', layerLabel: 'API & Integration', type: 'api-gateway', health: 'GREEN', rps: 1250, latency: 15, error: 0.1, cpu: 55, mem: 60, x: 450, y: 150 },
      { id: 'auth-service', name: 'Auth Service', layer: 'API_INTEGRATION', layerLabel: 'API & Integration', type: 'security-service', health: 'GREEN', rps: 640, latency: 32, error: 0.05, cpu: 48, mem: 56, x: 720, y: 150 },
      { id: 'kafka-event-bus', name: 'Kafka Event Bus', layer: 'API_INTEGRATION', layerLabel: 'API & Integration', type: 'event-stream', health: 'GREEN', rps: 3400, latency: 8, error: 0.01, cpu: 68, mem: 75, x: 990, y: 150 },

      // ── Layer 3: BUSINESS SERVICES (Y: 260) ───────────────────────────────
      { id: 'customer-api', name: 'Customer API', layer: 'BUSINESS_SERVICES', layerLabel: 'Business Services', type: 'microservice', health: 'GREEN', rps: 310, latency: 55, error: 0.1, cpu: 44, mem: 50, x: 100, y: 260 },
      { id: 'payments-service', name: 'Payments Microservice', layer: 'BUSINESS_SERVICES', layerLabel: 'Business Services', type: 'microservice', health: 'GREEN', rps: 450, latency: 110, error: 0.1, cpu: 65, mem: 70, x: 320, y: 260 },
      { id: 'account-service', name: 'Account Service', layer: 'BUSINESS_SERVICES', layerLabel: 'Business Services', type: 'microservice', health: 'GREEN', rps: 580, latency: 48, error: 0.05, cpu: 52, mem: 62, x: 540, y: 260 },
      { id: 'funds-transfer-service', name: 'Transfer Service', layer: 'BUSINESS_SERVICES', layerLabel: 'Business Services', type: 'microservice', health: 'GREEN', rps: 190, latency: 85, error: 0.1, cpu: 40, mem: 48, x: 760, y: 260 },
      { id: 'cards-processing-service', name: 'Card Authorization Service', layer: 'BUSINESS_SERVICES', layerLabel: 'Business Services', type: 'microservice', health: 'GREEN', rps: 380, latency: 95, error: 0.15, cpu: 58, mem: 64, x: 980, y: 260 },
      { id: 'fraud-detection-engine', name: 'Fraud Engine', layer: 'BUSINESS_SERVICES', layerLabel: 'Business Services', type: 'ai-service', health: 'GREEN', rps: 220, latency: 180, error: 0.2, cpu: 78, mem: 82, x: 1200, y: 260 },
      { id: 'notification-service', name: 'Notification Service', layer: 'BUSINESS_SERVICES', layerLabel: 'Business Services', type: 'microservice', health: 'GREEN', rps: 270, latency: 75, error: 0.2, cpu: 40, mem: 48, x: 1420, y: 260 },

      // ── Layer 4: DATA LAYER (Y: 370) ─────────────────────────────────────
      { id: 'customer-db', name: 'Customer DB', layer: 'DATA', layerLabel: 'Data & Storage', type: 'relational-db', health: 'GREEN', rps: 420, latency: 9, error: 0.02, cpu: 46, mem: 58, x: 180, y: 370 },
      { id: 'account-db', name: 'Account DB', layer: 'DATA', layerLabel: 'Data & Storage', type: 'relational-db', health: 'GREEN', rps: 780, latency: 6, error: 0.01, cpu: 58, mem: 70, x: 450, y: 370 },
      { id: 'payment-db', name: 'Payment DB', layer: 'DATA', layerLabel: 'Data & Storage', type: 'relational-db', health: 'GREEN', rps: 620, latency: 8, error: 0.01, cpu: 62, mem: 74, x: 720, y: 370 },
      { id: 'redis-cache', name: 'Redis Cache Cluster', layer: 'DATA', layerLabel: 'Data & Storage', type: 'cache', health: 'GREEN', rps: 4800, latency: 1, error: 0.0, cpu: 42, mem: 65, x: 990, y: 370 },
      { id: 'data-warehouse', name: 'Analytics Warehouse', layer: 'DATA', layerLabel: 'Data & Storage', type: 'data-warehouse', health: 'GREEN', rps: 180, latency: 250, error: 0.05, cpu: 45, mem: 55, x: 1260, y: 370 },

      // ── Layer 5: EXTERNAL DEPENDENCIES (Y: 480) ───────────────────────────
      { id: 'ext-visa-gateway', name: 'Visa Payment Gateway', layer: 'EXTERNAL_DEPENDENCIES', layerLabel: 'External Dependencies', type: 'external-service', health: 'GREEN', rps: 210, latency: 140, error: 0.1, cpu: 0, mem: 0, x: 250, y: 480 },
      { id: 'core-banking-ledger', name: 'Core Banking Engine', layer: 'EXTERNAL_DEPENDENCIES', layerLabel: 'External Dependencies', type: 'core-banking', health: 'GREEN', rps: 920, latency: 35, error: 0.01, cpu: 65, mem: 72, x: 650, y: 480 },
      { id: 'ext-swift-gateway', name: 'External Payment Gateway', layer: 'EXTERNAL_DEPENDENCIES', layerLabel: 'External Dependencies', type: 'external-service', health: 'GREEN', rps: 40, latency: 310, error: 0.05, cpu: 0, mem: 0, x: 1050, y: 480 },

      // ── Layer 6: PLATFORM / INFRASTRUCTURE (Y: 590) ───────────────────────
      { id: 'k8s-ingress-controller', name: 'Kubernetes Platform', layer: 'PLATFORM_INFRASTRUCTURE', layerLabel: 'Platform & Infrastructure', type: 'container-platform', health: 'GREEN', rps: 3500, latency: 2, error: 0.01, cpu: 45, mem: 55, x: 350, y: 590 },
      { id: 'prometheus-monitoring', name: 'Observability Stack', layer: 'PLATFORM_INFRASTRUCTURE', layerLabel: 'Platform & Infrastructure', type: 'monitoring', health: 'GREEN', rps: 1800, latency: 14, error: 0.02, cpu: 35, mem: 45, x: 850, y: 590 },
    ];

    this.nodes = rawNodes.map((n) => ({
      id: n.id,
      name: n.name,
      layer: n.layer,
      layerLabel: n.layerLabel,
      type: n.type,
      health: n.health,
      metrics: {
        throughputRps: n.rps,
        latencyP99Ms: n.latency,
        errorRatePercent: n.error,
        cpuPercent: n.cpu,
        memoryPercent: n.mem,
      },
      activeIncidentCount: 0,
      position: { x: n.x, y: n.y },
    }));

    // 28 Canonical End-to-End Dependency Edges
    const rawEdges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      rps: number;
      err: number;
    }> = [
      // Channels -> Ingress Load Balancer
      { id: 'e1', source: 'web-portal', target: 'ingress-load-balancer', type: 'HTTPS / REST', rps: 185, err: 0.1 },
      { id: 'e2', source: 'mobile-app-ios', target: 'ingress-load-balancer', type: 'HTTPS / REST', rps: 340, err: 0.2 },
      { id: 'e3', source: 'atm-network-gateway', target: 'ingress-load-balancer', type: 'ISO 8583', rps: 75, err: 0.05 },
      { id: 'e4', source: 'corporate-portal', target: 'ingress-load-balancer', type: 'HTTPS / mTLS', rps: 60, err: 0.1 },

      // Ingress -> API Gateway
      { id: 'e5', source: 'ingress-load-balancer', target: 'api-gateway', type: 'Internal Proxy', rps: 660, err: 0.1 },

      // API Gateway -> Services & Auth
      { id: 'e6', source: 'api-gateway', target: 'auth-service', type: 'OAuth 2.0 / JWT', rps: 640, err: 0.05 },
      { id: 'e7', source: 'api-gateway', target: 'customer-api', type: 'gRPC / REST', rps: 310, err: 0.1 },
      { id: 'e8', source: 'api-gateway', target: 'payments-service', type: 'gRPC / REST', rps: 450, err: 0.1 },
      { id: 'e9', source: 'api-gateway', target: 'funds-transfer-service', type: 'gRPC / REST', rps: 190, err: 0.1 },
      { id: 'e10', source: 'api-gateway', target: 'cards-processing-service', type: 'gRPC / REST', rps: 380, err: 0.15 },

      // Customer API -> DBs & Redis
      { id: 'e11', source: 'customer-api', target: 'redis-cache', type: 'Redis Protocol', rps: 1200, err: 0.0 },
      { id: 'e12', source: 'customer-api', target: 'customer-db', type: 'PostgreSQL Pool', rps: 420, err: 0.02 },

      // Payments Service -> Fraud, DB, Visa, Kafka
      { id: 'e13', source: 'payments-service', target: 'fraud-detection-engine', type: 'Synchronous gRPC', rps: 220, err: 0.2 },
      { id: 'e14', source: 'payments-service', target: 'payment-db', type: 'PostgreSQL Pool', rps: 620, err: 0.01 },
      { id: 'e15', source: 'payments-service', target: 'ext-visa-gateway', type: 'External REST / ISO', rps: 210, err: 0.1 },
      { id: 'e16', source: 'payments-service', target: 'kafka-event-bus', type: 'Event Producer', rps: 1400, err: 0.01 },

      // Account Service -> DB, Redis, Core Banking
      { id: 'e17', source: 'account-service', target: 'account-db', type: 'PostgreSQL Pool', rps: 780, err: 0.01 },
      { id: 'e18', source: 'account-service', target: 'redis-cache', type: 'Redis Protocol', rps: 2400, err: 0.0 },
      { id: 'e19', source: 'account-service', target: 'core-banking-ledger', type: 'Mainframe gRPC', rps: 920, err: 0.01 },

      // Transfer Service -> Account Service, External Gateway
      { id: 'e20', source: 'funds-transfer-service', target: 'account-service', type: 'Internal Call', rps: 190, err: 0.05 },
      { id: 'e21', source: 'funds-transfer-service', target: 'ext-swift-gateway', type: 'SWIFT MT103', rps: 40, err: 0.05 },

      // Cards Processing -> Fraud, Visa Gateway
      { id: 'e22', source: 'cards-processing-service', target: 'fraud-detection-engine', type: 'Synchronous gRPC', rps: 180, err: 0.15 },
      { id: 'e23', source: 'cards-processing-service', target: 'ext-visa-gateway', type: 'Visa Direct ISO', rps: 180, err: 0.1 },

      // Kafka -> Notifications, Warehouse
      { id: 'e24', source: 'kafka-event-bus', target: 'notification-service', type: 'Kafka Consumer', rps: 270, err: 0.2 },
      { id: 'e25', source: 'kafka-event-bus', target: 'data-warehouse', type: 'ETL Pipeline', rps: 180, err: 0.05 },

      // Infra -> Services
      { id: 'e26', source: 'k8s-ingress-controller', target: 'ingress-load-balancer', type: 'NodePort / LB', rps: 3500, err: 0.01 },
      { id: 'e27', source: 'prometheus-monitoring', target: 'api-gateway', type: 'Scrape Metrics', rps: 900, err: 0.02 },
      { id: 'e28', source: 'prometheus-monitoring', target: 'payments-service', type: 'Scrape Metrics', rps: 900, err: 0.02 },
    ];

    this.edges = rawEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      transactionType: e.type,
      health: 'GREEN' as ComponentHealthStatus,
      throughputRps: e.rps,
      errorRatePercent: e.err,
    }));
  }
}

export const canonicalTopology = new CanonicalEstateTopology();

export const CHAOS_SCENARIOS: EstateChaosScenario[] = [
  {
    id: 'payment-db-latency',
    name: '1. Payment DB Latency Spike',
    description: 'Database lock contention in Payment DB causing latency P99 to spike to 1500ms.',
    targetComponentId: 'payment-db',
    targetComponentName: 'Payment DB',
    health: 'RED',
    metricsOverride: { latencyP99Ms: 1500, errorRatePercent: 8.0, cpuPercent: 92 },
    expectedDownstreamImpact: ['payments-service', 'api-gateway', 'web-portal'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'payment-api-errors',
    name: '2. Payment API 5xx Spike',
    description: 'Uncaught null reference exception in Payments API resulting in 25% 5xx error rate.',
    targetComponentId: 'payments-service',
    targetComponentName: 'Payments Microservice',
    health: 'RED',
    metricsOverride: { errorRatePercent: 25.0, latencyP99Ms: 950, cpuPercent: 88 },
    expectedDownstreamImpact: ['api-gateway', 'web-portal'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'auth-failure',
    name: '3. Authentication Failure Cascade',
    description: 'Token validation service timeout causing 35% login authentication failures.',
    targetComponentId: 'auth-service',
    targetComponentName: 'Auth Service',
    health: 'RED',
    metricsOverride: { errorRatePercent: 35.0, latencyP99Ms: 1200, cpuPercent: 95 },
    expectedDownstreamImpact: ['api-gateway', 'mobile-app-ios', 'web-portal'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'redis-outage',
    name: '4. Redis Cache Eviction Storm',
    description: 'Redis memory maxout causing cash miss storm and 2000ms latency spikes.',
    targetComponentId: 'redis-cache',
    targetComponentName: 'Redis Cache Cluster',
    health: 'AMBER',
    metricsOverride: { latencyP99Ms: 2000, errorRatePercent: 5.5, cpuPercent: 99 },
    expectedDownstreamImpact: ['customer-api', 'account-service'],
    riskLevel: 'HIGH',
  },
  {
    id: 'kafka-backlog',
    name: '5. Kafka Consumer Lag',
    description: 'Partition rebalance stuck causing 1200ms message delivery delays.',
    targetComponentId: 'kafka-event-bus',
    targetComponentName: 'Kafka Event Bus',
    health: 'AMBER',
    metricsOverride: { latencyP99Ms: 1200, errorRatePercent: 3.0, cpuPercent: 82 },
    expectedDownstreamImpact: ['notification-service', 'data-warehouse'],
    riskLevel: 'MEDIUM',
  },
  {
    id: 'external-gateway-failure',
    name: '6. Visa Payment Gateway Outage',
    description: 'External Visa partner API timeouts resulting in 45% card authorization drops.',
    targetComponentId: 'ext-visa-gateway',
    targetComponentName: 'Visa Payment Gateway',
    health: 'RED',
    metricsOverride: { errorRatePercent: 45.0, latencyP99Ms: 2500 },
    expectedDownstreamImpact: ['cards-processing-service', 'payments-service'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'cpu-saturation',
    name: '7. Core Banking CPU Saturation',
    description: 'End-of-day batch processing consuming 98% CPU on Core Banking Engine.',
    targetComponentId: 'core-banking-ledger',
    targetComponentName: 'Core Banking Engine',
    health: 'AMBER',
    metricsOverride: { cpuPercent: 98, latencyP99Ms: 1400, errorRatePercent: 4.0 },
    expectedDownstreamImpact: ['account-service'],
    riskLevel: 'HIGH',
  },
  {
    id: 'network-latency',
    name: '8. API Gateway Throttling',
    description: 'DDoS mitigation rate-limiter throttling legitimate channel traffic.',
    targetComponentId: 'api-gateway',
    targetComponentName: 'API Gateway',
    health: 'AMBER',
    metricsOverride: { latencyP99Ms: 1800, errorRatePercent: 12.0 },
    expectedDownstreamImpact: ['mobile-app-ios', 'web-portal', 'atm-network-gateway'],
    riskLevel: 'HIGH',
  },
  {
    id: 'fraud-engine-failure',
    name: '9. Fraud Engine Timeout',
    description: 'ML model inference latency stalling fraud evaluation for credit transactions.',
    targetComponentId: 'fraud-detection-engine',
    targetComponentName: 'Fraud Engine',
    health: 'RED',
    metricsOverride: { errorRatePercent: 50.0, latencyP99Ms: 1100 },
    expectedDownstreamImpact: ['payments-service', 'cards-processing-service'],
    riskLevel: 'HIGH',
  },
];
