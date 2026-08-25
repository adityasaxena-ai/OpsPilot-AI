import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { getOperationalReport, getGovernanceReport, getExecutiveReport } from './reporting.service.js';

async function logReportAccess(actorSubject: string | undefined, reportType: string, days?: number) {
  try {
    await db.auditLog.create({
      data: {
        actorType: 'USER',
        action: 'GENERATE_REPORT',
        targetType: 'report',
        targetId: reportType,
        metadata: {
          reportType,
          days: days ?? null,
          actorSubject: actorSubject ?? null,
        },
      },
    });
  } catch (err) {
    // Non-blocking log warning — report generation response must never fail due to audit logging hiccups
    console.warn(`[Reporting] Failed to write AuditLog entry for ${reportType}:`, err);
  }
}

export const reportingRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/reports/operational?days=30 — Operational report aggregation
  app.get<{ Querystring: { days?: string } }>(
    '/operational',
    { preHandler: requirePermission('REPORTING_VIEW') },
    async (request) => {
      const days = Math.max(1, parseInt(request.query.days ?? '30', 10) || 30);
      const report = await getOperationalReport(db, days);

      void logReportAccess(request.user?.subject, 'OPERATIONAL', days);

      return { success: true, data: report };
    }
  );

  // GET /api/v1/reports/governance — Governance report aggregation
  app.get('/governance', { preHandler: requirePermission('REPORTING_VIEW') }, async (request) => {
    const report = await getGovernanceReport(db);

    void logReportAccess(request.user?.subject, 'GOVERNANCE');

    return { success: true, data: report };
  });

  // GET /api/v1/reports/executive?days=30 — Executive report rollup
  app.get<{ Querystring: { days?: string } }>(
    '/executive',
    { preHandler: requirePermission('REPORTING_VIEW') },
    async (request) => {
      const days = Math.max(1, parseInt(request.query.days ?? '30', 10) || 30);
      const report = await getExecutiveReport(db, days);

      void logReportAccess(request.user?.subject, 'EXECUTIVE', days);

      return { success: true, data: report };
    }
  );
};
