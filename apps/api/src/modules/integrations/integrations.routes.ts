import type { FastifyPluginAsync } from 'fastify';
import { IntegrationService } from './integrations.service.js';

export const integrationRoutes: FastifyPluginAsync = async (app) => {
  const service = IntegrationService.getInstance();

  // GET /api/v1/integrations — Status of configured integrations
  app.get('/', async () => {
    return {
      success: true,
      data: {
        slack: {
          configured: !!process.env['SLACK_WEBHOOK_URL'],
          webhookUrl: process.env['SLACK_WEBHOOK_URL'] ? '***CONFIGURED***' : null,
        },
        pagerduty: {
          configured: !!process.env['PAGERDUTY_ROUTING_KEY'],
          routingKey: process.env['PAGERDUTY_ROUTING_KEY'] ? '***CONFIGURED***' : null,
        },
        jira: {
          configured: !!process.env['JIRA_DOMAIN'],
          domain: process.env['JIRA_DOMAIN'] ?? null,
        },
      },
    };
  });

  // POST /api/v1/integrations/test — Send test notification to configured endpoints
  app.post('/test', async () => {
    const result = await service.dispatchEvent({
      event: 'INCIDENT_CREATED',
      incidentId: 'inc-test-001',
      title: 'TEST ALERT: High Memory Usage on payment-service',
      severity: 'P1',
      serviceName: 'payment-service',
      timestamp: new Date().toISOString(),
      details: { environment: 'production', threshold: '92%' },
    });

    return {
      success: true,
      data: {
        message: 'Test enterprise notifications dispatched',
        dispatchedTo: result.dispatchedTo,
      },
    };
  });
};
