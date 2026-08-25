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
  | 'ADMIN_CONFIGURATION'
  | 'GOVERNANCE_VIEW'
  | 'GOVERNANCE_MANAGE'
  | 'GOVERNANCE_APPROVE'
  | 'DRIFT_VIEW'
  | 'DRIFT_MANAGE'
  | 'DRIFT_REVIEW'
  | 'AI_INCIDENT_VIEW'
  | 'AI_INCIDENT_MANAGE'
  | 'REPORTING_VIEW'
  | 'PREDICTION_VIEW'
  | 'PREDICTION_MANAGE'
  | 'KNOWLEDGE_VIEW'
  | 'KNOWLEDGE_MANAGE';

// Note: Role is intentionally NOT unified with Prisma UserRole as of 2026-08-24.
// JWT-claims-based Role is the source of truth for authorization;
// User.role (Prisma) is not currently read by any authorization code path. Documented decision.
export type Role = 'VIEWER' | 'SRE_OPERATOR' | 'INCIDENT_COMMANDER' | 'SECURITY_ADMIN';
