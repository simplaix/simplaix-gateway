/**
 * User Service
 * Manages gateway users (Agent Creators) and their roles
 */

import { eq, and, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../../db/index.js';
import { users, userRoles } from '../../db/schema.js';

// User role types
export type UserRole = 'admin' | 'agent_creator' | 'tenant_admin';

// User interface
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  tenantId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

// User with roles
export interface UserWithRoles extends Omit<User, 'passwordHash'> {
  roles: UserRole[];
}

// Create user input
export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  tenantId?: string;
  roles?: UserRole[];
}

// Update user input
export interface UpdateUserInput {
  email?: string;
  name?: string;
  tenantId?: string;
  isActive?: boolean;
}

const BCRYPT_ROUNDS = 12;

/**
 * User Service class
 */
class UserService {
  // ==================== Password Hashing ====================

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // ==================== User CRUD ====================

  async createUser(data: CreateUserInput): Promise<UserWithRoles> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();
    const passwordHash = await this.hashPassword(data.password);

    await db.insert(users).values({
      id,
      email: data.email.toLowerCase().trim(),
      passwordHash,
      name: data.name || null,
      tenantId: data.tenantId || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const roles = data.roles || ['agent_creator'];
    for (const role of roles) {
      await this.assignRole(id, role);
    }

    console.log(`[UserService] Created user: ${id} (${data.email})`);

    return {
      id,
      email: data.email.toLowerCase().trim(),
      name: data.name || null,
      tenantId: data.tenantId || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      roles,
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      tenantId: row.tenantId,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || null,
    };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const db = getDatabase();
    const normalizedEmail = email.toLowerCase().trim();

    const results = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      tenantId: row.tenantId,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || null,
    };
  }

  async getUserWithRoles(id: string): Promise<UserWithRoles | null> {
    const user = await this.getUserById(id);
    if (!user) return null;

    const roles = await this.getUserRoles(id);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      roles,
    };
  }

  async updateUser(id: string, data: UpdateUserInput): Promise<User | null> {
    const db = getDatabase();
    const now = new Date();

    const updates: Record<string, unknown> = { updatedAt: now };

    if (data.email !== undefined) updates.email = data.email.toLowerCase().trim();
    if (data.name !== undefined) updates.name = data.name;
    if (data.tenantId !== undefined) updates.tenantId = data.tenantId;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    await db
      .update(users)
      .set(updates as typeof users.$inferInsert)
      .where(eq(users.id, id));

    return this.getUserById(id);
  }

  async updatePassword(id: string, newPassword: string): Promise<boolean> {
    const db = getDatabase();
    const now = new Date();
    const passwordHash = await this.hashPassword(newPassword);

    await db
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, id));

    return true;
  }

  async deleteUser(id: string): Promise<boolean> {
    const db = getDatabase();

    await db.delete(userRoles).where(eq(userRoles.userId, id));
    await db.delete(users).where(eq(users.id, id));

    console.log(`[UserService] Deleted user: ${id}`);
    return true;
  }

  async listUsers(tenantId?: string): Promise<UserWithRoles[]> {
    const db = getDatabase();

    const query = tenantId
      ? db.select().from(users).where(eq(users.tenantId, tenantId))
      : db.select().from(users);

    const results = await query;
    const usersList: User[] = results.map((row) => ({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      tenantId: row.tenantId,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || null,
    }));

    if (usersList.length === 0) return [];

    // Batch role lookup to avoid N+1 queries for large user lists.
    const userIds = usersList.map((user) => user.id);
    const roleRows = await db
      .select()
      .from(userRoles)
      .where(inArray(userRoles.userId, userIds));

    const roleMap = new Map<string, UserRole[]>();
    for (const row of roleRows) {
      const roles = roleMap.get(row.userId) || [];
      roles.push(row.role as UserRole);
      roleMap.set(row.userId, roles);
    }

    return usersList.map((user) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...userWithoutPassword } = user;
      return { ...userWithoutPassword, roles: roleMap.get(user.id) || [] };
    });
  }

  // ==================== Role Management ====================

  async assignRole(userId: string, role: UserRole): Promise<boolean> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();

    const existingRoles = await this.getUserRoles(userId);
    if (existingRoles.includes(role)) return true;

    await db.insert(userRoles).values({
      id,
      userId,
      role,
      createdAt: now,
    });

    console.log(`[UserService] Assigned role '${role}' to user: ${userId}`);
    return true;
  }

  async removeRole(userId: string, role: UserRole): Promise<boolean> {
    const db = getDatabase();

    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));

    console.log(`[UserService] Removed role '${role}' from user: ${userId}`);
    return true;
  }

  async getUserRoles(userId: string): Promise<UserRole[]> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    return results.map((row) => row.role as UserRole);
  }

  async hasRole(userId: string, role: UserRole): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.includes(role);
  }

  async hasAnyRole(userId: string, roles: UserRole[]): Promise<boolean> {
    const userRolesResult = await this.getUserRoles(userId);
    return roles.some((role) => userRolesResult.includes(role));
  }

  // ==================== Authentication Helpers ====================

  async authenticate(email: string, password: string): Promise<UserWithRoles | null> {
    const user = await this.getUserByEmail(email);

    if (!user) {
      console.log(`[UserService] Authentication failed: user not found (${email})`);
      return null;
    }

    if (!user.isActive) {
      console.log(`[UserService] Authentication failed: user inactive (${email})`);
      return null;
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      console.log(`[UserService] Authentication failed: invalid password (${email})`);
      return null;
    }

    const roles = await this.getUserRoles(user.id);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;

    console.log(`[UserService] User authenticated: ${user.id} (${email})`);

    return { ...userWithoutPassword, roles };
  }

  // ==================== Initial Setup ====================

  async ensureInitialAdmin(email: string, password: string): Promise<UserWithRoles | null> {
    const existingUsers = await this.listUsers();
    if (existingUsers.length > 0) {
      console.log('[UserService] Users already exist, skipping initial admin creation');
      return null;
    }

    console.log(`[UserService] Creating initial admin user: ${email}`);
    return this.createUser({
      email,
      password,
      name: 'Admin',
      roles: ['admin', 'agent_creator'],
    });
  }
}

// Export singleton instance
export const userService = new UserService();
