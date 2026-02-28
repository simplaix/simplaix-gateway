/**
 * Authentication service for JWT verification.
 *
 * Supports:
 * 1. Gateway-issued JWTs
 * 2. External JWTs from configured issuers
 * 3. Session JWTs for end-user context propagation
 */

import * as jose from 'jose';
import type { UserContext } from '../../types/index.js';
import { getConfig } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { AuthError } from './errors.js';
import type { JWTPayload, SessionJWTPayload } from './types.js';
import { verifyExternalJWT } from './external-jwt.js';
import { issueSessionJWT, verifySessionJWT } from './session-jwt.js';
import { issuePairingToken, verifyPairingToken, issueDeviceToken } from './pairing-jwt.js';

function shouldAllowUnsignedJwt(): boolean {
  const allowUnsigned = process.env.AUTH_ALLOW_UNSIGNED_JWT === 'true';
  const isProduction = process.env.NODE_ENV === 'production';
  return allowUnsigned && !isProduction;
}

function decodeJWTUnsafe(token: string): JWTPayload | null {
  try {
    return jose.decodeJwt(token) as JWTPayload;
  } catch {
    return null;
  }
}

export { AuthError, issueSessionJWT, verifySessionJWT };
export { issuePairingToken, verifyPairingToken, issueDeviceToken };
export type { SessionJWTPayload };
export type { PairingTokenPayload } from './pairing-jwt.js';

export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

async function verifyGatewayJWT(token: string): Promise<UserContext> {
  const config = getConfig();

  try {
    let payload: JWTPayload;

    if (config.jwtPublicKey) {
      const publicKey = await jose.importSPKI(config.jwtPublicKey, 'RS256');
      const result = await jose.jwtVerify(token, publicKey, {
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      });
      payload = result.payload as JWTPayload;
    } else if (config.jwtSecret) {
      const secret = new TextEncoder().encode(config.jwtSecret);
      const result = await jose.jwtVerify(token, secret, {
        issuer: config.jwtIssuer,
      });
      payload = result.payload as JWTPayload;
    } else {
      if (!shouldAllowUnsignedJwt()) {
        throw new AuthError(
          'JWT verification keys are not configured. Set JWT_SECRET or JWT_PUBLIC_KEY.',
          'CONFIG_ERROR'
        );
      }
      logger.warn('[Auth] WARNING: accepting unsigned gateway JWT due to AUTH_ALLOW_UNSIGNED_JWT=true (non-production only)');
      payload = jose.decodeJwt(token) as JWTPayload;
    }

    return {
      id: payload.sub,
      tenantId: payload.tenant_id,
      email: payload.email,
      roles: payload.roles,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof jose.errors.JWTExpired) {
      throw new AuthError('Token expired', 'TOKEN_EXPIRED');
    }
    if (error instanceof jose.errors.JWTInvalid) {
      throw new AuthError('Invalid token', 'INVALID_TOKEN');
    }
    throw new AuthError('Gateway JWT verification failed', 'AUTH_FAILED');
  }
}

export async function verifyJWT(token: string): Promise<UserContext> {
  const config = getConfig();
  const decoded = decodeJWTUnsafe(token);
  if (!decoded) {
    throw new AuthError('Invalid token format', 'INVALID_TOKEN');
  }

  const issuer = decoded.iss;
  const gatewayIssuer = config.jwtIssuer || 'simplaix-gateway';

  if (issuer === gatewayIssuer) {
    logger.debug(`[Auth] Verifying gateway JWT (issuer: ${issuer})`);
    return verifyGatewayJWT(token);
  }

  if (issuer) {
    const externalUser = await verifyExternalJWT(token, issuer);
    if (externalUser) {
      logger.debug(`[Auth] Verifying external JWT (issuer: ${issuer})`);
      return externalUser;
    }
  }

  if (!config.jwtSecret && !config.jwtPublicKey && shouldAllowUnsignedJwt()) {
    logger.warn('[Auth] WARNING: accepting token without verification due to AUTH_ALLOW_UNSIGNED_JWT=true (non-production only)');
    return {
      id: decoded.sub,
      tenantId: decoded.tenant_id,
      email: decoded.email,
      roles: decoded.roles,
    };
  }

  throw new AuthError(`Unknown JWT issuer: ${issuer || 'none'}`, 'UNKNOWN_ISSUER');
}
