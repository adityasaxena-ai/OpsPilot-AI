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

export type Role = 'VIEWER' | 'SRE_OPERATOR' | 'INCIDENT_COMMANDER' | 'SECURITY_ADMIN';
