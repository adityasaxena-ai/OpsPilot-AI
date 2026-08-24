export interface AuthenticatedPrincipal {
  subject: string;
  email?: string;
  displayName?: string;
  roles: string[];
  groups?: string[];
  issuer?: string;
}

export type Permission =
  | 'INCIDENT_VIEW'
  | 'AI_INVESTIGATE'
  | 'DECISION_VIEW'
  | 'REMEDIATION_VIEW'
  | 'REMEDIATION_APPROVE'
  | 'REMEDIATION_EXECUTE'
  | 'AUDIT_VIEW'
  | 'ADMIN_CONFIGURATION';

// Note: Role is intentionally NOT unified with Prisma UserRole as of 2026-08-24.
// JWT-claims-based Role is the source of truth for authorization;
// User.role (Prisma) is not currently read by any authorization code path. Documented decision.
export type Role = 'VIEWER' | 'SRE_OPERATOR' | 'INCIDENT_COMMANDER' | 'SECURITY_ADMIN';
