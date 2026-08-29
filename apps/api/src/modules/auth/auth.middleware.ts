import type { FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '@opspilot/config';
import type { AuthenticatedPrincipal, Permission, Role } from './auth.types.js';
import { hasPermission } from './rbac.service.js';
import { parseJwt } from './jwt.service.js';

// ── Production safety guard ────────────────────────────────────────────────
// ENABLE_DEMO_AUTH=true bypasses the full auth layer and must NEVER be set
// in a production environment. Crash early on startup if it is detected.
if (process.env.NODE_ENV === 'production' && process.env['ENABLE_DEMO_AUTH'] === 'true') {
  console.error(
    '\n[SECURITY] FATAL: ENABLE_DEMO_AUTH=true is not permitted when NODE_ENV=production.\n' +
    '          This env var bypasses authentication entirely. Remove it from Railway env vars.\n',
  );
  process.exit(1);
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedPrincipal;
  }
}

export function extractPrincipal(request: FastifyRequest): { principal: AuthenticatedPrincipal | null; errorCode?: string } {
  const authHeader = request.headers['authorization'];

  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === 'expired-token') {
      return { principal: null, errorCode: 'TOKEN_EXPIRED' };
    }

    const parsed = parseJwt(token, {
      issuer: process.env['OIDC_ISSUER_URL'],
      audience: process.env['OIDC_AUDIENCE'],
    });

    if (!parsed) {
      return { principal: null, errorCode: 'INVALID_TOKEN' };
    }
    return { principal: parsed };
  }

  // Development / Staging fallback when NODE_ENV !== 'production' or ENABLE_DEMO_AUTH === 'true'
  const isDevOrDemo = process.env.NODE_ENV !== 'production' || process.env['ENABLE_DEMO_AUTH'] === 'true';
  if (isDevOrDemo) {
    const operatorId = (request.headers['x-operator-id'] as string) || (request.body as any)?.approvedBy || 'dev-user-admin';
    const roles: Role[] = operatorId.includes('commander')
      ? ['INCIDENT_COMMANDER']
      : operatorId.includes('viewer')
      ? ['VIEWER']
      : ['SRE_OPERATOR'];

    return {
      principal: {
        subject: operatorId,
        displayName: operatorId,
        roles,
        issuer: 'opspilot-dev-fallback',
      },
    };
  }

  // Production mode strictly requires valid Bearer token
  return { principal: null, errorCode: 'AUTHENTICATION_REQUIRED' };
}

export async function attachUserContext(request: FastifyRequest, _reply: FastifyReply) {
  const { principal } = extractPrincipal(request);
  if (principal) {
    request.user = principal;
  }
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { principal, errorCode } = extractPrincipal(request);

    if (!principal) {
      const code = errorCode || 'AUTHENTICATION_REQUIRED';
      const msg = code === 'TOKEN_EXPIRED'
        ? 'Authentication token has expired'
        : code === 'INVALID_TOKEN'
        ? 'Invalid authentication token'
        : 'Mandatory Bearer authentication required';

      return reply.status(401).send({
        success: false,
        error: { code, message: msg },
      });
    }

    request.user = principal;

    if (!hasPermission(principal, permission)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSION',
          message: `Principal '${principal.subject}' lacks required permission '${permission}'`,
        },
      });
    }
  };
}
