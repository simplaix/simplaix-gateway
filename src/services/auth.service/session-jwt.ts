import * as jose from 'jose';
import { getConfig } from '../../config.js';
import { AuthError } from './errors.js';
import type { SessionJWTPayload } from './types.js';

export async function issueSessionJWT(claims: SessionJWTPayload): Promise<string | null> {
  const config = getConfig();
  if (!config.jwtSecret) {
    return null;
  }

  const secret = new TextEncoder().encode(config.jwtSecret);

  return new jose.SignJWT({
    sub: claims.userId,
    type: 'session',
    agent_id: claims.agentId,
    tenant_id: claims.tenantId,
    roles: claims.roles,
    email: claims.email,
    request_id: claims.requestId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .setIssuer(config.jwtIssuer || 'simplaix-gateway')
    .sign(secret);
}

export async function verifySessionJWT(token: string): Promise<SessionJWTPayload> {
  const config = getConfig();
  if (!config.jwtSecret) {
    throw new AuthError('JWT_SECRET not configured — cannot verify session tokens', 'CONFIG_ERROR');
  }

  const secret = new TextEncoder().encode(config.jwtSecret);

  try {
    const result = await jose.jwtVerify(token, secret, {
      issuer: config.jwtIssuer || 'simplaix-gateway',
    });

    const payload = result.payload as jose.JWTPayload & {
      type?: string;
      agent_id?: string;
      tenant_id?: string;
      roles?: string[];
      email?: string;
      request_id?: string;
    };

    if (payload.type !== 'session') {
      throw new AuthError('Not a session token', 'INVALID_TOKEN');
    }

    return {
      userId: payload.sub!,
      agentId: payload.agent_id!,
      tenantId: payload.tenant_id,
      roles: payload.roles,
      email: payload.email,
      requestId: payload.request_id!,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof jose.errors.JWTExpired) {
      throw new AuthError('Session token expired', 'TOKEN_EXPIRED');
    }
    throw new AuthError('Session token verification failed', 'AUTH_FAILED');
  }
}
