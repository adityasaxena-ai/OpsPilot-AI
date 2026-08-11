import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AIOrchestrator } from '@opspilot/agents';
import { getAIProvider } from '@opspilot/ai';
import { db } from '../../lib/db.js';

export const aiRoutes: FastifyPluginAsync = async (app) => {
  const orchestrator = new AIOrchestrator(db);

  // POST /api/v1/ai/triage — Trigger AI Triage for an incident
  app.post<{ Body: { incidentId: string } }>('/triage', async (request, reply) => {
    const { incidentId } = request.body;
    if (!incidentId) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PARAM', message: 'incidentId required' } });
    }

    try {
      const result = await orchestrator.runTriage(incidentId);
      return { success: true, data: result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI Triage failed';
      return reply.status(500).send({ success: false, error: { code: 'TRIAGE_FAILED', message: msg } });
    }
  });

  // POST /api/v1/ai/investigate — Trigger Full AI Pipeline (Triage -> Evidence -> Investigation -> RCA)
  app.post<{ Body: { incidentId: string } }>('/investigate', async (request, reply) => {
    const { incidentId } = request.body;
    if (!incidentId) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PARAM', message: 'incidentId required' } });
    }

    try {
      const result = await orchestrator.runFullPipeline(incidentId);
      return { success: true, data: result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI Investigation failed';
      return reply.status(500).send({ success: false, error: { code: 'INVESTIGATION_FAILED', message: msg } });
    }
  });

  // POST /api/v1/ai/postmortem — Generate AI Postmortem for resolved incident
  app.post<{ Body: { incidentId: string } }>('/postmortem', async (request, reply) => {
    const { incidentId } = request.body ?? {};
    if (!incidentId) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PARAM', message: 'incidentId required' } });
    }

    const incident = await db.incident.findUnique({ where: { id: incidentId } });
    if (!incident) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    }

    if (String(incident.status) !== 'RESOLVED' && String(incident.status) !== 'CLOSED') {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INCIDENT_NOT_RESOLVED',
          message: 'AI Post Mortem is available after the incident has been resolved.',
        },
      });
    }

    try {
      const result = await orchestrator.runPostmortem(incidentId);
      return { success: true, data: result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Postmortem generation failed';
      return reply.status(500).send({ success: false, error: { code: 'POSTMORTEM_FAILED', message: msg } });
    }
  });

  // POST /api/v1/ai/chat — AI Copilot interactive assistant
  app.post<{ Body: { message: string; incidentId?: string } }>('/chat', async (request, reply) => {
    const { message, incidentId } = request.body;
    if (!message) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PARAM', message: 'message required' } });
    }

    const aiProvider = getAIProvider();

    let incidentContext = '';
    if (incidentId) {
      const inc = await db.incident.findUnique({
        where: { id: incidentId },
        include: { service: true, evidence: true, rcaResults: { take: 1 } },
      });

      if (inc) {
        incidentContext = `\nCurrent Incident Context:\nTitle: ${inc.title}\nSeverity: ${inc.severity}\nStatus: ${inc.status}\nService: ${inc.service?.name}\nRCA: ${inc.rcaResults[0]?.probableCause ?? 'Pending'}`;
      }
    }

    const response = await aiProvider.complete({
      systemPrompt: `You are OpsPilot AI Copilot, an expert autonomous Site Reliability Engineer assistant. Help operators debug incidents, write runbooks, and analyze telemetry.${incidentContext}`,
      messages: [{ role: 'user', content: message }],
      temperature: 0.3,
    });

    return {
      success: true,
      data: {
        reply: response.text,
        model: response.model,
        tokenUsage: response.tokenUsage,
      },
    };
  });

  // GET /api/v1/ai/investigations/:incidentId — Get AI investigation history for an incident
  app.get<{ Params: { incidentId: string } }>('/investigations/:incidentId', async (request) => {
    const investigations = await db.investigation.findMany({
      where: { incidentId: request.params['incidentId'] },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: investigations };
  });
};
