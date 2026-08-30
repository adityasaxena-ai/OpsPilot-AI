import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAuthToken, setOnUnauthorized } from '@/lib/api';

export type Role = 'VIEWER' | 'SRE_OPERATOR' | 'INCIDENT_COMMANDER' | 'SECURITY_ADMIN';
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

export interface UserPrincipal {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  roles: Role[];
}

export const DEMO_CREDENTIALS: Record<Role, { username: string; password: string; label: string }> = {
  VIEWER: { username: 'viewer', password: 'OpsPilot2026!viewer', label: 'Demo Viewer' },
  SRE_OPERATOR: { username: 'sre', password: 'OpsPilot2026!sre', label: 'SRE Operator' },
  INCIDENT_COMMANDER: { username: 'commander', password: 'OpsPilot2026!commander', label: 'Incident Commander' },
  SECURITY_ADMIN: { username: 'admin', password: 'OpsPilot2026!admin', label: 'Security Admin' },
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
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
    'DRIFT_REVIEW',
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

interface AuthContextType {
  token: string | null;
  user: UserPrincipal | null;
  isAuthenticated: boolean;
  loginError: string | null;
  isLoggingIn: boolean;
  login: (username?: string, password?: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
  switchRole: (role: Role) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  isAuthenticated: false,
  loginError: null,
  isLoggingIn: false,
  login: async () => false,
  logout: () => {},
  hasPermission: () => false,
  switchRole: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserPrincipal | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const logout = () => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    setLoginError(null);
  };

  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });
  }, []);

  const login = async (username?: string, password?: string): Promise<boolean> => {
    if (!username || !password) {
      setLoginError('Username and password are required');
      return false;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await api.auth.login({ username, password });
      if (res.success && res.data.token) {
        const newToken = res.data.token;
        const uData = res.data.user;
        const principal: UserPrincipal = {
          id: uData.id,
          username: uData.username,
          displayName: uData.name || uData.username,
          email: uData.email,
          roles: [uData.role as Role],
        };

        setToken(newToken);
        setUser(principal);
        setAuthToken(newToken);
        setIsLoggingIn(false);
        return true;
      } else {
        setLoginError('Authentication failed');
        setIsLoggingIn(false);
        return false;
      }
    } catch (err: any) {
      setLoginError(err.message || 'Invalid username or password');
      setIsLoggingIn(false);
      return false;
    }
  };

  const switchRole = async (role: Role) => {
    const creds = DEMO_CREDENTIALS[role];
    if (creds) {
      await login(creds.username, creds.password);
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user || !user.roles) return false;
    return user.roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: Boolean(token && user),
        loginError,
        isLoggingIn,
        login,
        logout,
        hasPermission,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
