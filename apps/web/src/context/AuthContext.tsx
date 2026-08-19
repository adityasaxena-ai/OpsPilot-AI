import React, { createContext, useContext, useState } from 'react';

export type Role = 'VIEWER' | 'SRE_OPERATOR' | 'INCIDENT_COMMANDER' | 'SECURITY_ADMIN';
export type Permission =
  | 'INCIDENT_VIEW'
  | 'AI_INVESTIGATE'
  | 'DECISION_VIEW'
  | 'REMEDIATION_VIEW'
  | 'REMEDIATION_APPROVE'
  | 'REMEDIATION_EXECUTE'
  | 'AUDIT_VIEW'
  | 'ADMIN_CONFIGURATION';

export interface UserPrincipal {
  subject: string;
  displayName: string;
  email?: string;
  roles: Role[];
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  VIEWER: ['INCIDENT_VIEW', 'AI_INVESTIGATE', 'DECISION_VIEW', 'REMEDIATION_VIEW', 'AUDIT_VIEW'],
  SRE_OPERATOR: ['INCIDENT_VIEW', 'AI_INVESTIGATE', 'DECISION_VIEW', 'REMEDIATION_VIEW', 'AUDIT_VIEW', 'REMEDIATION_APPROVE'],
  INCIDENT_COMMANDER: ['INCIDENT_VIEW', 'AI_INVESTIGATE', 'DECISION_VIEW', 'REMEDIATION_VIEW', 'AUDIT_VIEW', 'REMEDIATION_APPROVE', 'REMEDIATION_EXECUTE'],
  SECURITY_ADMIN: ['INCIDENT_VIEW', 'AI_INVESTIGATE', 'DECISION_VIEW', 'REMEDIATION_VIEW', 'AUDIT_VIEW', 'ADMIN_CONFIGURATION'],
};

interface AuthContextType {
  user: UserPrincipal;
  hasPermission: (permission: Permission) => boolean;
  switchRole: (role: Role) => void;
}

const defaultUser: UserPrincipal = {
  subject: 'op-lead-sre-777',
  displayName: 'Lead SRE Operator (op-lead-sre-777)',
  email: 'sre-lead@opspilot.ai',
  roles: ['SRE_OPERATOR', 'INCIDENT_COMMANDER'],
};

const AuthContext = createContext<AuthContextType>({
  user: defaultUser,
  hasPermission: () => true,
  switchRole: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserPrincipal>(defaultUser);

  const hasPermission = (permission: Permission): boolean => {
    return user.roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
  };

  const switchRole = (role: Role) => {
    setUser((prev) => ({ ...prev, roles: [role] }));
  };

  return <AuthContext.Provider value={{ user, hasPermission, switchRole }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
