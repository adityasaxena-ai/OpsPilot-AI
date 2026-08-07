import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/analytics/overview
  app.get('/overview', async () => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      activeIncidents,
      resolvedToday,
      alertsToday,
      resolvedWithMetrics,
      totalIncidents,
      aiTriagedIncidents,
    ] = await Promise.all([
      db.incident.count({ where: { status: { notIn: ['RESOLVED', 'FAILED'] } } }),
      db.incident.count({ where: { status: 'RESOLVED', resolvedAt: { gte: startOfDay } } }),
      db.alert.count({ where: { createdAt: { gte: startOfDay } } }),
      db.incident.findMany({
        where: {
          status: 'RESOLVED',
          mttdSeconds: { not: null },
          mttrSeconds: { not: null },
          resolvedAt: { gte: last30Days },
        },
        select: { mttdSeconds: true, mttaSeconds: true, mttrSeconds: true },
      }),
      db.incident.count({ where: { createdAt: { gte: last30Days } } }),
      db.incident.count({ where: { aiTriageConfidence: { not: null }, createdAt: { gte: last30Days } } }),
    ]);

    const avg = (arr: (number | null | undefined)[]) => {
      const valid = arr.filter((n): n is number => n != null);
      return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
    };

    return {
      success: true,
      data: {
        activeIncidents,
        resolvedToday,
        alertsToday,
        mttdSeconds: avg(resolvedWithMetrics.map((i) => i.mttdSeconds)),
        mttaSeconds: avg(resolvedWithMetrics.map((i) => i.mttaSeconds)),
        mttrSeconds: avg(resolvedWithMetrics.map((i) => i.mttrSeconds)),
        availabilityPercent: 99.9, // Phase 4: calculate from real SLO data
        automationRate: totalIncidents > 0 ? Math.round((aiTriagedIncidents / totalIncidents) * 100) : 0,
        aiTriageRate: totalIncidents > 0 ? Math.round((aiTriagedIncidents / totalIncidents) * 100) : 0,
        sloCompliancePercent: 99.2, // Phase 4: real SLO calculation
      },
    };
  });

  // GET /api/v1/analytics/incidents
  app.get<{ Querystring: { days?: string } }>('/incidents', async (request) => {
    const days = parseInt(request.query['days'] ?? '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const incidents = await db.incident.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        severity: true,
        status: true,
        serviceId: true,
        detectedAt: true,
        resolvedAt: true,
        mttrSeconds: true,
        aiTriageConfidence: true,
      },
      orderBy: { detectedAt: 'asc' },
    });

    // Group by day
    const byDay: Record<string, number> = {};
    for (const inc of incidents) {
      const day = inc.detectedAt.toISOString().substring(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    const bySeverity = {
      P1: incidents.filter((i) => i.severity === 'P1').length,
      P2: incidents.filter((i) => i.severity === 'P2').length,
      P3: incidents.filter((i) => i.severity === 'P3').length,
      P4: incidents.filter((i) => i.severity === 'P4').length,
      P5: incidents.filter((i) => i.severity === 'P5').length,
    };

    return {
      success: true,
      data: { byDay, bySeverity, total: incidents.length },
    };
  });

  // GET /api/v1/analytics/automation
  app.get('/automation', async () => {
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [total, aiTriaged, remediations, succeeded] = await Promise.all([
      db.incident.count({ where: { createdAt: { gte: last30 } } }),
      db.incident.count({ where: { aiTriageConfidence: { not: null }, createdAt: { gte: last30 } } }),
      db.remediationAction.count({ where: { createdAt: { gte: last30 } } }),
      db.remediationAction.count({ where: { status: 'SUCCEEDED', createdAt: { gte: last30 } } }),
    ]);

    return {
      success: true,
      data: {
        totalIncidents: total,
        aiTriaged,
        remediationsProposed: remediations,
        remediationsSucceeded: succeeded,
        successRate: remediations > 0 ? Math.round((succeeded / remediations) * 100) : 0,
        estimatedHoursSaved: aiTriaged * 0.5, // 30min per AI-triaged incident
      },
    };
  });
};
