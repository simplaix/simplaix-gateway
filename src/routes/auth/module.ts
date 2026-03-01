/**
 * Authentication routes
 * 
 * - POST /verify-credentials: verify email/password, return user info (no JWT)
 * - GET /me: get current user profile
 * - PUT /me: update current user profile
 * - POST /change-password: change password
 *
 * JWT issuance is handled by gateway-app; gateway core only verifies tokens.
 */

import { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { userService } from '../../services/user.service/index.js';
import { jwtAuthMiddleware, flexibleAuthMiddleware } from '../../middleware/auth.js';
import {
  issuePairingToken,
  verifyPairingToken,
  issueDeviceToken,
} from '../../services/auth.service/index.js';
import { pushService } from '../../services/push.service/index.js';
import { getConfig } from '../../config.js';

const authRoutes = new Hono<{ Variables: GatewayVariables }>();

// Short-lived in-memory store for pairing codes (code → JWT token, auto-expire)
const pairingCodes = new Map<string, { token: string; expires: number }>();

function generateShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * POST /api/v1/auth/verify-credentials
 * Verify email and password, return user info (NO JWT).
 * JWT signing is the responsibility of the calling management app.
 */
authRoutes.post('/verify-credentials', async (c) => {
  let body: { email: string; password: string };
  
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  try {
    const user = await userService.authenticate(body.email, body.password);
    
    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        roles: user.roles,
      },
    });
  } catch (error) {
    console.error('[Auth] Credential verification error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user profile
 */
authRoutes.get('/me', jwtAuthMiddleware, async (c) => {
  const currentUser = c.get('user');

  try {
    const user = await userService.getUserWithRoles(currentUser.id);
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        isActive: user.isActive,
        roles: user.roles,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Auth] Get profile error:', error);
    return c.json({ error: 'Failed to get profile' }, 500);
  }
});

/**
 * PUT /api/v1/auth/me
 * Update current user profile
 */
authRoutes.put('/me', jwtAuthMiddleware, async (c) => {
  const currentUser = c.get('user');

  let body: {
    name?: string;
    email?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    if (body.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return c.json({ error: 'Invalid email format' }, 400);
      }

      const existingUser = await userService.getUserByEmail(body.email);
      if (existingUser && existingUser.id !== currentUser.id) {
        return c.json({ error: 'Email is already in use' }, 409);
      }
    }

    await userService.updateUser(currentUser.id, {
      name: body.name,
      email: body.email,
    });

    const user = await userService.getUserWithRoles(currentUser.id);

    return c.json({
      success: true,
      user: {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        tenantId: user!.tenantId,
        roles: user!.roles,
      },
    });
  } catch (error) {
    console.error('[Auth] Update profile error:', error);
    return c.json({ error: 'Failed to update profile' }, 500);
  }
});

/**
 * POST /api/v1/auth/change-password
 * Change current user's password
 */
authRoutes.post('/change-password', jwtAuthMiddleware, async (c) => {
  const currentUser = c.get('user');

  let body: {
    currentPassword: string;
    newPassword: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.currentPassword || !body.newPassword) {
    return c.json({ error: 'Current password and new password are required' }, 400);
  }

  if (body.newPassword.length < 8) {
    return c.json({ error: 'New password must be at least 8 characters' }, 400);
  }

  try {
    const user = await userService.getUserById(currentUser.id);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    const isValid = await userService.verifyPassword(
      body.currentPassword,
      user.passwordHash
    );
    
    if (!isValid) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    await userService.updatePassword(currentUser.id, body.newPassword);

    return c.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('[Auth] Change password error:', error);
    return c.json({ error: 'Failed to change password' }, 500);
  }
});

/**
 * POST /api/v1/auth/pairing-code
 * Generate a pairing token + deep link for an end user.
 * Requires art_xxx or other flexible auth (agent calling on behalf of user).
 */
authRoutes.post('/pairing-code', flexibleAuthMiddleware, async (c) => {
  let body: { peerId: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.peerId) {
    return c.json({ error: 'peerId is required' }, 400);
  }

  try {
    const user = c.get('user');
    const agent = c.get('agent');
    const token = await issuePairingToken(body.peerId, user?.tenantId, agent?.id);

    const gatewayUrl = process.env.GATEWAY_PUBLIC_URL || `http://localhost:${getConfig().port}`;

    const code = generateShortCode();
    pairingCodes.set(code, { token, expires: Date.now() + 5 * 60 * 1000 });

    const deepLink = `${gatewayUrl}/api/v1/auth/pair-link/${code}`;

    return c.json({ token, deepLink });
  } catch (error) {
    console.error('[Auth] Pairing code error:', error);
    return c.json({ error: 'Failed to generate pairing code' }, 500);
  }
});

/**
 * GET /api/v1/auth/pair-link/:code
 * Public HTML page that redirects to the app's custom scheme.
 * Uses a short code so the URL is clickable in WhatsApp/Telegram.
 */
authRoutes.get('/pair-link/:code', async (c) => {
  const code = c.req.param('code');
  const entry = pairingCodes.get(code);

  if (!entry || entry.expires < Date.now()) {
    pairingCodes.delete(code);
    return c.html(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link Expired</title></head>
<body style="font-family:system-ui;text-align:center;padding:60px 20px">
<h2>Link expired</h2><p>Please send /pair again to get a new link.</p>
</body></html>`, 410);
  }

  const gatewayUrl = process.env.GATEWAY_PUBLIC_URL || `http://localhost:${getConfig().port}`;
  const appUrl = `simplaixapprovalapp://pair?g=${encodeURIComponent(gatewayUrl)}&t=${encodeURIComponent(entry.token)}`;

  // Don't delete — allow re-taps within the 5min window
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Simplaix Pairing</title>
<script>window.location.href=${JSON.stringify(appUrl)};</script>
</head>
<body style="font-family:system-ui;text-align:center;padding:60px 20px">
<h2>Opening Simplaix app...</h2>
<p>If the app didn't open, <a href="${appUrl}">tap here</a>.</p>
</body>
</html>`;

  return c.html(html);
});

/**
 * POST /api/v1/auth/pair
 * Exchange a pairing token for a long-lived device JWT.
 * Public endpoint — the pairing token itself is the authentication.
 */
authRoutes.post('/pair', async (c) => {
  let body: {
    pairingToken: string;
    pushToken: string;
    platform: 'ios' | 'macos' | 'android';
    deviceName?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.pairingToken) {
    return c.json({ error: 'pairingToken is required' }, 400);
  }
  if (!body.pushToken) {
    return c.json({ error: 'pushToken is required' }, 400);
  }
  if (!body.platform || !['ios', 'macos', 'android'].includes(body.platform)) {
    return c.json({ error: 'platform must be ios, macos, or android' }, 400);
  }

  try {
    const pairing = await verifyPairingToken(body.pairingToken);
    const deviceToken = await issueDeviceToken(pairing.peerId, pairing.tenantId);

    await pushService.registerDevice({
      userId: pairing.peerId,
      tenantId: pairing.tenantId,
      platform: body.platform,
      pushToken: body.pushToken,
      deviceName: body.deviceName,
    });

    const gatewayUrl = process.env.GATEWAY_PUBLIC_URL || `http://localhost:${getConfig().port}`;

    return c.json({
      token: deviceToken,
      gatewayUrl,
      peerId: pairing.peerId,
    });
  } catch (error: any) {
    if (error?.code === 'TOKEN_EXPIRED') {
      return c.json({ error: 'Pairing token expired' }, 401);
    }
    if (error?.code === 'INVALID_TOKEN' || error?.code === 'AUTH_FAILED') {
      return c.json({ error: 'Invalid pairing token' }, 401);
    }
    console.error('[Auth] Pair exchange error:', error);
    return c.json({ error: 'Failed to complete pairing' }, 500);
  }
});

export { authRoutes };
