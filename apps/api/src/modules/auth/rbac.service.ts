import type { AuthenticatedPrincipal, Permission, Role } from './auth.types.js';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  VIEWER: [
    'INCIDENT_VIEW',
    'AI_INVESTIGATE',
    'DECISION_VIEW',
    'REMEDIATION_VIEW',
    'AUDIT_VIEW',
  ],
  SRE_OPERATOR: [
    'INCIDENT_VIEW',
    'AI_INVESTIGATE',
    'DECISION_VIEW',
    'REMEDIATION_VIEW',
    'AUDIT_VIEW',
    'REMEDIATION_APPROVE',
  ],
  INCIDENT_COMMANDER: [
    'INCIDENT_VIEW',
    'AI_INVESTIGATE',
    'DECISION_VIEW',
    'REMEDIATION_VIEW',
    'AUDIT_VIEW',
    'REMEDIATION_APPROVE',
    'REMEDIATION_EXECUTE',
  ],
  SECURITY_ADMIN: [
    'INCIDENT_VIEW',
    'AI_INVESTIGATE',
    'DECISION_VIEW',
    'REMEDIATION_VIEW',
    'AUDIT_VIEW',
    'ADMIN_CONFIGURATION',
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
