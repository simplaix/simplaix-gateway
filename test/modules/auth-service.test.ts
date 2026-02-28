import test from 'node:test';
import assert from 'node:assert/strict';
import * as jose from 'jose';

import { AuthError, verifyJWT } from '../../src/services/auth.service/index.js';
import { getConfig, setConfig } from '../../src/config.js';

test('verifyJWT fails closed when no verification keys are configured', async () => {
  // This guards the production security invariant: no unsigned fallback by default.
  const originalConfig = structuredClone(getConfig());
  const originalAllowUnsigned = process.env.AUTH_ALLOW_UNSIGNED_JWT;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    process.env.AUTH_ALLOW_UNSIGNED_JWT = 'false';
    process.env.NODE_ENV = 'production';

    setConfig({
      ...originalConfig,
      jwtSecret: undefined,
      jwtPublicKey: undefined,
      jwtIssuer: 'simplaix-gateway',
      externalIssuers: [],
    });

    const secret = new TextEncoder().encode('temporary-signing-secret');
    const token = await new jose.SignJWT({ sub: 'u1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('simplaix-gateway')
      .setExpirationTime('10m')
      .sign(secret);

    await assert.rejects(
      async () => verifyJWT(token),
      (error: unknown) =>
        error instanceof AuthError && error.code === 'CONFIG_ERROR'
    );
  } finally {
    setConfig(originalConfig);
    if (originalAllowUnsigned === undefined) delete process.env.AUTH_ALLOW_UNSIGNED_JWT;
    else process.env.AUTH_ALLOW_UNSIGNED_JWT = originalAllowUnsigned;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
