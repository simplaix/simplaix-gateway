import * as jose from 'jose';
import { getConfig } from '../../config.js';
import { AuthError } from './errors.js';

export interface PairingTokenPayload {
  peerId: string;
  tenantId?: string;
  agentId?: string;
}

export async function issuePairingToken(
  peerId: string,
  tenantId?: string,
  agentId?: string,
): Promise<string> {
  const config = getConfig();
  if (!config.jwtSecret) {
    throw new AuthError('JWT_SECRET not configured — cannot issue pairing tokens', 'CONFIG_ERROR');
  }

  const secret = new TextEncoder().encode(config.jwtSecret);

  return new jose.SignJWT({
    sub: peerId,
    type: 'pairing',
    tenant_id: tenantId,
    agent_id: agentId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .setIssuer(config.jwtIssuer || 'simplaix-gateway')
    .sign(secret);
}

export async function verifyPairingToken(token: string): Promise<PairingTokenPayload> {
  const config = getConfig();
  if (!config.jwtSecret) {
    throw new AuthError('JWT_SECRET not configured — cannot verify pairing tokens', 'CONFIG_ERROR');
  }

  const secret = new TextEncoder().encode(config.jwtSecret);

  try {
    const result = await jose.jwtVerify(token, secret, {
      issuer: config.jwtIssuer || 'simplaix-gateway',
    });

    const payload = result.payload as jose.JWTPayload & {
      type?: string;
      tenant_id?: string;
      agent_id?: string;
    };

    if (payload.type !== 'pairing') {
      throw new AuthError('Not a pairing token', 'INVALID_TOKEN');
    }

    return {
      peerId: payload.sub!,
      tenantId: payload.tenant_id,
      agentId: payload.agent_id,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof jose.errors.JWTExpired) {
      throw new AuthError('Pairing token expired', 'TOKEN_EXPIRED');
    }
    throw new AuthError('Pairing token verification failed', 'AUTH_FAILED');
  }
}

export async function issueDeviceToken(
  peerId: string,
  tenantId?: string,
): Promise<string> {
  const config = getConfig();
  if (!config.jwtSecret) {
    throw new AuthError('JWT_SECRET not configured — cannot issue device tokens', 'CONFIG_ERROR');
  }

  const secret = new TextEncoder().encode(config.jwtSecret);

  return new jose.SignJWT({
    sub: peerId,
    type: 'device',
    tenant_id: tenantId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('90d')
    .setIssuer(config.jwtIssuer || 'simplaix-gateway')
    .sign(secret);
}
