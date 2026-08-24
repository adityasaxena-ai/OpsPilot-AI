import jwt from 'jsonwebtoken';
import { getConfig } from '@opspilot/config';
import type { AuthenticatedPrincipal } from './auth.types.js';

export interface JwtVerifyOptions {
  issuer?: string | undefined;
  audience?: string | undefined;
}

export function parseJwt(token: string, options: JwtVerifyOptions = {}): AuthenticatedPrincipal | null {
  if (!token || typeof token !== 'string') return null;

  try {
    const config = getConfig();
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ['HS256'],
    };

    if (options.issuer) {
      verifyOptions.issuer = options.issuer;
    }
    if (options.audience) {
      verifyOptions.audience = options.audience;
    }

    const payload = jwt.verify(token, config.JWT_SECRET, verifyOptions) as jwt.JwtPayload;

    const roles: string[] = Array.isArray(payload['roles'])
      ? (payload['roles'] as string[])
      : Array.isArray((payload['realm_access'] as { roles?: string[] })?.roles)
      ? ((payload['realm_access'] as { roles?: string[] }).roles as string[])
      : [(payload['role'] as string) || 'SRE_OPERATOR'];

    const principal: AuthenticatedPrincipal = {
      subject: (payload.sub as string) || 'unknown-user',
      roles,
    };

    if (typeof payload['email'] === 'string') {
      principal.email = payload['email'];
    }
    const displayName = (payload['name'] || payload['preferred_username'] || payload.sub) as string | undefined;
    if (displayName) {
      principal.displayName = displayName;
    }
    if (typeof payload.iss === 'string') {
      principal.issuer = payload.iss;
    }

    return principal;
  } catch (err) {
    return null;
  }
}
