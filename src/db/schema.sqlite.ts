/**
 * Database schema definitions using Drizzle ORM (SQLite)
 * Mirror of schema.ts — used at runtime when DATABASE_URL is a file path.
 * TypeScript types are sourced from schema.ts (pgTable); this file is runtime-only.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ==================== Tables ====================

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id'),
  agentId: text('agent_id'),
  endUserId: text('end_user_id'),
  providerId: text('provider_id'),
  toolName: text('tool_name').notNull(),
  arguments: text('arguments'),
  result: text('result'),
  confirmationId: text('confirmation_id'),
  confirmedBy: text('confirmed_by'),
  status: text('status').notNull(),
  duration: integer('duration'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
});

export const confirmations = sqliteTable('confirmations', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id'),
  toolName: text('tool_name').notNull(),
  arguments: text('arguments'),
  risk: text('risk').notNull(),
  status: text('status').notNull(),
  confirmedBy: text('confirmed_by'),
  reason: text('reason'),
  providerId: text('provider_id'),
  agentId: text('agent_id'),
  endUserId: text('end_user_id'),
  ruleId: text('rule_id'),
  confirmationToken: text('confirmation_token'),
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),

  upstreamUrl: text('upstream_url').notNull(),
  upstreamSecret: text('upstream_secret'),

  runtimeTokenHash: text('runtime_token_hash'),
  runtimeTokenPrefix: text('runtime_token_prefix'),

  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  requireConfirmation: integer('require_confirmation', { mode: 'boolean' }).default(false),

  requiredCredentials: text('required_credentials'),

  tenantId: text('tenant_id'),
  ownerUserId: text('owner_user_id'),

  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  tenantId: text('tenant_id'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const userRoles = sqliteTable('user_roles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const toolProviders = sqliteTable('tool_providers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  name: text('name').notNull(),
  pattern: text('pattern').notNull(),
  endpoint: text('endpoint').notNull(),
  authType: text('auth_type').default('none'),
  authSecret: text('auth_secret'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  priority: integer('priority').default(0),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const credentialProviders = sqliteTable('credential_providers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  serviceType: text('service_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  authType: text('auth_type').notNull(),
  config: text('config'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const userCredentials = sqliteTable('user_credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  providerId: text('provider_id').notNull(),
  credentials: text('credentials').notNull(),
  scopes: text('scopes'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  refreshToken: text('refresh_token'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const providerAccessRules = sqliteTable('provider_access_rules', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  providerId: text('provider_id').notNull(),
  action: text('action').notNull(),
  toolPattern: text('tool_pattern').default('*'),
  confirmationMode: text('confirmation_mode'),
  riskLevel: text('risk_level'),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const deviceTokens = sqliteTable('device_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id'),
  platform: text('platform').notNull(),
  pushToken: text('push_token').notNull(),
  deviceName: text('device_name'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  name: text('name').notNull(),
  scopes: text('scopes'),
  createdBy: text('created_by').notNull(),
  tenantId: text('tenant_id'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
});
