import type { AuthenticatedPrincipal, Permission, Role } from './auth.types.js';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  VIEWER: [
    'INCIDENT_VIEW',
    'AI_INVESTIGATE',
    'DECISION_VIEW',
    'REMEDIATION_VIEW',
    'AUDIT_VIEW',
    'GOVERNANCE_VIEW',
    'DRIFT_VIEW',
    'AI_INCIDENT_VIEW',
    'REPORTING_VIEW',
    'PREDICTION_VIEW',
    'KNOWLEDGE_VIEW',
  ],
  SRE_OPERATOR: [
    'INCIDENT_VIEW',
    'AI_INVESTIGATE',
    'DECISION_VIEW',
    'REMEDIATION_VIEW',
    'AUDIT_VIEW',
    'REMEDIATION_APPROVE',
    'GOVERNANCE_VIEW',
    'GOVERNANCE_MANAGE',
    'DRIFT_VIEW',
    'DRIFT_MANAGE',
    'AI_INCIDENT_VIEW',
    'AI_INCIDENT_MANAGE',
    'REPORTING_VIEW',
    'PREDICTION_VIEW',
    'PREDICTION_MANAGE',
    'KNOWLEDGE_VIEW',
    'KNOWLEDGE_MANAGE',
  ],
  INCIDENT_COMMANDER: [
    'INCIDENT_VIEW',
    'AI_INVESTIGATE',
    'DECISION_VIEW',
    'REMEDIATION_VIEW',
    'AUDIT_VIEW',
    'REMEDIATION_APPROVE',
    'REMEDIATION_EXECUTE',
    'GOVERNANCE_VIEW',
    'GOVERNANCE_MANAGE',
    'GOVERNANCE_APPROVE',
    'DRIFT_VIEW',
    'DRIFT_MANAGE',
    'DRIFT_REVIEW',
    'AI_INCIDENT_VIEW',
    'AI_INCIDENT_MANAGE',
    'REPORTING_VIEW',
    'PREDICTION_VIEW',
    'PREDICTION_MANAGE',
    'KNOWLEDGE_VIEW',
    'KNOWLEDGE_MANAGE',
  ],
  SECURITY_ADMIN: [
    'INCIDENT_VIEW',
    'AI_INVESTIGATE',
    'DECISION_VIEW',
    'REMEDIATION_VIEW',
    'AUDIT_VIEW',
    'ADMIN_CONFIGURATION',
    'GOVERNANCE_VIEW',
    'GOVERNANCE_MANAGE',
    'GOVERNANCE_APPROVE',
    'DRIFT_VIEW',
    'DRIFT_MANAGE',
    'DRIFT_REVIEW',
    'AI_INCIDENT_VIEW',
    'AI_INCIDENT_MANAGE',
    'REPORTING_VIEW',
    'PREDICTION_VIEW',
    'PREDICTION_MANAGE',
    'KNOWLEDGE_VIEW',
    'KNOWLEDGE_MANAGE',
  ],
};

export function hasPermission(principal: AuthenticatedPrincipal | undefined, requiredPermission: Permission): boolean {
  if (!principal || !principal.roles || principal.roles.length === 0) {
    return false;
  }

  for (const roleName of principal.roles) {
    const permissions = ROLE_PERMISSIONS[roleName as Role];
    if (permissions && permissions.includes(requiredPermission)) {
      return true;
    }
  }
  return false;
}
