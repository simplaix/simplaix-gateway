import * as jose from 'jose';
import type { ExternalIssuerConfig, UserContext } from '../../types/index.js';
import { getConfig } from '../../config.js';
import { AuthError } from './errors.js';
import type { JWTPayload } from './types.js';

const jwksCaches = new Map<string, jose.JWTVerifyGetKey>();

async function verifyExternalJWTWithSecret(
  token: string,
  config: ExternalIssuerConfig
): Promise<UserContext> {
  if (!config.secret) {
    throw new AuthError('External issuer secret not configured', 'CONFIG_ERROR');
  }

  try {
    const secret = new TextEncoder().encode(config.secret);
    const verifyOptions: jose.JWTVerifyOptions = { issuer: config.issuer };
    if (config.audience) {
      verifyOptions.audience = config.audience;
    }

    const result = await jose.jwtVerify(token, secret, verifyOptions);
    const payload = result.payload as JWTPayload;
    return {
      id: payload.sub,
      tenantId: payload.tenant_id,
      email: payload.email,
      roles: payload.roles,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new AuthError('Token expired', 'TOKEN_EXPIRED');
    }
    throw new AuthError('External JWT verification failed', 'AUTH_FAILED');
  }
}

async function verifyExternalJWTWithJWKS(
  token: string,
  config: ExternalIssuerConfig
): Promise<UserContext> {
  if (!config.jwksUri) {
    throw new AuthError('JWKS URI not configured', 'CONFIG_ERROR');
  }

  let jwks = jwksCaches.get(config.issuer);
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(config.jwksUri));
    jwksCaches.set(config.issuer, jwks);
  }

  try {
    const verifyOptions: jose.JWTVerifyOptions = { issuer: config.issuer };
    if (config.audience) {
      verifyOptions.audience = config.audience;
    }

    const result = await jose.jwtVerify(token, jwks, verifyOptions);
    const payload = result.payload as JWTPayload;
    return {
      id: payload.sub,
      tenantId: payload.tenant_id,
      email: payload.email,
      roles: payload.roles,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new AuthError('Token expired', 'TOKEN_EXPIRED');
    }
    throw new AuthError('External JWT verification failed', 'AUTH_FAILED');
  }
}

function findExternalIssuer(issuer: string): ExternalIssuerConfig | null {
  const config = getConfig();
  const externalIssuers = config.externalIssuers || [];
  return externalIssuers.find((i) => i.issuer === issuer) || null;
}

export async function verifyExternalJWT(token: string, issuer: string): Promise<UserContext | null> {
  const externalConfig = findExternalIssuer(issuer);
  if (!externalConfig) return null;

  if (externalConfig.jwksUri) {
    return verifyExternalJWTWithJWKS(token, externalConfig);
  }
  if (externalConfig.secret) {
    return verifyExternalJWTWithSecret(token, externalConfig);
  }

  throw new AuthError(
    `External issuer ${issuer} has no secret or JWKS configured`,
    'CONFIG_ERROR'
  );
}
