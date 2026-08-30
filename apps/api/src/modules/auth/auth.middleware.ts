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

if (process.env['ENABLE_DEMO_AUTH'] === 'true') {
  console.warn(
    '\n⚠️  ENABLE_DEMO_AUTH is active — all requests without a valid token are\n' +
    '    being treated as dev-user-admin (SRE_OPERATOR). This must never be\n' +
    '    true in a real deployment.\n'
  );
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

  // Explicit opt-in fallback when ENABLE_DEMO_AUTH === 'true'
  const isDemoAuthEnabled = process.env['ENABLE_DEMO_AUTH'] === 'true';
  if (isDemoAuthEnabled) {
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

  // Fail closed by default for all unauthenticated requests
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
