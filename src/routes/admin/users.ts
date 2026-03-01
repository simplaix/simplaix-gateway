import type { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { userService, type UserRole } from '../../services/user.service/index.js';
import { logger } from '../../utils/logger.js';
import { EMAIL_REGEX, serializeUser, VALID_USER_ROLES } from './shared.js';

export function registerAdminUserRoutes(adminRoutes: Hono<{ Variables: GatewayVariables }>) {
  adminRoutes.get('/users', requirePermission('user:read'), async (c) => {
    const user = c.get('user');
    const userRoles = user.roles || [];

    try {
      const tenantId = userRoles.includes('admin') ? undefined : user.tenantId;
      const users = await userService.listUsers(tenantId || undefined);

      return c.json({
        users: users.map((u) => ({
          ...serializeUser(u),
          updatedAt: undefined,
        })),
        count: users.length,
      });
    } catch (error) {
      logger.error('[Admin] Failed to list users:', error);
      return c.json({ error: 'Failed to list users' }, 500);
    }
  });

  adminRoutes.post('/users', requirePermission('user:create'), async (c) => {
    let body: {
      email: string;
      password: string;
      name?: string;
      tenantId?: string;
      roles?: UserRole[];
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.email || !body.password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }
    if (!EMAIL_REGEX.test(body.email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }
    if (body.password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }
    if (body.roles) {
      for (const role of body.roles) {
        if (!VALID_USER_ROLES.includes(role)) {
          return c.json({ error: `Invalid role: ${role}` }, 400);
        }
      }
    }

    try {
      const existingUser = await userService.getUserByEmail(body.email);
      if (existingUser) {
        return c.json({ error: 'User with this email already exists' }, 409);
      }

      const newUser = await userService.createUser({
        email: body.email,
        password: body.password,
        name: body.name,
        tenantId: body.tenantId,
        roles: body.roles || ['agent_creator'],
      });

      return c.json({
        success: true,
        user: {
          ...serializeUser(newUser),
          updatedAt: undefined,
        },
      }, 201);
    } catch (error) {
      logger.error('[Admin] Failed to create user:', error);
      return c.json({ error: 'Failed to create user' }, 500);
    }
  });

  adminRoutes.get('/users/:id', requirePermission('user:read'), async (c) => {
    const userId = c.req.param('id');

    try {
      const user = await userService.getUserWithRoles(userId);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }
      return c.json({ user: serializeUser(user) });
    } catch (error) {
      logger.error('[Admin] Failed to get user:', error);
      return c.json({ error: 'Failed to get user' }, 500);
    }
  });

  adminRoutes.put('/users/:id', requirePermission('user:update'), async (c) => {
    const userId = c.req.param('id');

    let body: {
      email?: string;
      name?: string;
      tenantId?: string;
      isActive?: boolean;
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (body.email) {
      if (!EMAIL_REGEX.test(body.email)) {
        return c.json({ error: 'Invalid email format' }, 400);
      }

      const existingUser = await userService.getUserByEmail(body.email);
      if (existingUser && existingUser.id !== userId) {
        return c.json({ error: 'Email is already in use' }, 409);
      }
    }

    try {
      const user = await userService.updateUser(userId, body);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }

      const userWithRoles = await userService.getUserWithRoles(userId);
      return c.json({
        success: true,
        user: serializeUser(userWithRoles!),
      });
    } catch (error) {
      logger.error('[Admin] Failed to update user:', error);
      return c.json({ error: 'Failed to update user' }, 500);
    }
  });

  adminRoutes.delete('/users/:id', requirePermission('user:delete'), async (c) => {
    const userId = c.req.param('id');
    const currentUser = c.get('user');

    if (userId === currentUser.id) {
      return c.json({ error: 'Cannot delete your own account' }, 400);
    }

    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }

      await userService.deleteUser(userId);
      return c.json({ success: true, message: 'User deleted' });
    } catch (error) {
      logger.error('[Admin] Failed to delete user:', error);
      return c.json({ error: 'Failed to delete user' }, 500);
    }
  });

  adminRoutes.post('/users/:id/roles', requirePermission('user:assign_role'), async (c) => {
    const userId = c.req.param('id');

    let body: { role: UserRole };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.role || !VALID_USER_ROLES.includes(body.role)) {
      return c.json({ error: `Invalid role. Must be one of: ${VALID_USER_ROLES.join(', ')}` }, 400);
    }

    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }

      await userService.assignRole(userId, body.role);
      const userWithRoles = await userService.getUserWithRoles(userId);

      return c.json({
        success: true,
        user: {
          id: userWithRoles!.id,
          email: userWithRoles!.email,
          roles: userWithRoles!.roles,
        },
      });
    } catch (error) {
      logger.error('[Admin] Failed to assign role:', error);
      return c.json({ error: 'Failed to assign role' }, 500);
    }
  });

  adminRoutes.delete('/users/:id/roles/:role', requirePermission('user:assign_role'), async (c) => {
    const userId = c.req.param('id');
    const role = c.req.param('role') as UserRole;

    if (!VALID_USER_ROLES.includes(role)) {
      return c.json({ error: `Invalid role. Must be one of: ${VALID_USER_ROLES.join(', ')}` }, 400);
    }

    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }

      await userService.removeRole(userId, role);
      const userWithRoles = await userService.getUserWithRoles(userId);

      return c.json({
        success: true,
        user: {
          id: userWithRoles!.id,
          email: userWithRoles!.email,
          roles: userWithRoles!.roles,
        },
      });
    } catch (error) {
      logger.error('[Admin] Failed to remove role:', error);
      return c.json({ error: 'Failed to remove role' }, 500);
    }
  });
}
