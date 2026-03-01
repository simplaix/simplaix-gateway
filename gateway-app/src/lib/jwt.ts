import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || "simplaix-gateway";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

interface PlatformUser {
  id: string;
  email: string;
  name?: string | null;
  tenantId?: string | null;
  roles: string[];
}

/**
 * Sign a JWT for a platform user (admin / agent creator).
 * Uses the same secret and issuer as gateway core so that
 * gateway core's `verifyGatewayJWT()` accepts the token seamlessly.
 */
export async function signJWT(user: PlatformUser): Promise<string> {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured in gateway-app");
  }

  const secret = new TextEncoder().encode(JWT_SECRET);

  return new SignJWT({
    sub: user.id,
    email: user.email,
    tenant_id: user.tenantId ?? undefined,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .setIssuer(JWT_ISSUER)
    .sign(secret);
}

/**
 * Verify a JWT locally (used during token refresh).
 * Returns the decoded payload or throws on invalid/expired tokens.
 */
export async function verifyJWTLocal(
  token: string,
): Promise<JWTPayload & { sub: string }> {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured in gateway-app");
  }

  const secret = new TextEncoder().encode(JWT_SECRET);

  const { payload } = await jwtVerify(token, secret, {
    issuer: JWT_ISSUER,
  });

  if (!payload.sub) {
    throw new Error("Token missing sub claim");
  }

  return payload as JWTPayload & { sub: string };
}
