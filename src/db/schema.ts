/**
 * Database schema definitions using Drizzle ORM (PostgreSQL)
 */

import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

// ==================== Tables ====================

export const auditLogs = pgTable('audit_logs', {
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
  status: text('status').notNull().$type<'pending' | 'confirmed' | 'rejected' | 'completed' | 'failed'>(),
  duration: integer('duration'),
  createdAt: timestamp('created_at').notNull(),
  completedAt: timestamp('completed_at'),
});

export const confirmations = pgTable('confirmations', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id'),
  toolName: text('tool_name').notNull(),
  arguments: text('arguments'),
  risk: text('risk').notNull().$type<'low' | 'medium' | 'high' | 'critical'>(),
  status: text('status').notNull().$type<'pending' | 'confirmed' | 'rejected' | 'expired' | 'consumed'>(),
  confirmedBy: text('confirmed_by'),
  reason: text('reason'),
  providerId: text('provider_id'),
  agentId: text('agent_id'),
  endUserId: text('end_user_id'),
  ruleId: text('rule_id'),
  confirmationToken: text('confirmation_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  createdAt: timestamp('created_at').notNull(),
  resolvedAt: timestamp('resolved_at'),
});

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),

  upstreamUrl: text('upstream_url').notNull(),
  upstreamSecret: text('upstream_secret'),

  runtimeTokenHash: text('runtime_token_hash'),
  runtimeTokenPrefix: text('runtime_token_prefix'),

  isActive: boolean('is_active').notNull().default(true),
  requireConfirmation: boolean('require_confirmation').default(false),

  requiredCredentials: text('required_credentials'),

  tenantId: text('tenant_id'),
  ownerUserId: text('owner_user_id'),

  description: text('description'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  tenantId: text('tenant_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const userRoles = pgTable('user_roles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const toolProviders = pgTable('tool_providers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  name: text('name').notNull(),
  pattern: text('pattern').notNull(),
  endpoint: text('endpoint').notNull(),
  authType: text('auth_type').$type<'bearer' | 'api_key' | 'none'>().default('none'),
  authSecret: text('auth_secret'),
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').default(0),
  description: text('description'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const credentialProviders = pgTable('credential_providers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  serviceType: text('service_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  authType: text('auth_type').notNull().$type<'oauth2' | 'api_key' | 'jwt' | 'basic'>(),
  config: text('config'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const userCredentials = pgTable('user_credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  providerId: text('provider_id').notNull(),
  credentials: text('credentials').notNull(),
  scopes: text('scopes'),
  expiresAt: timestamp('expires_at'),
  refreshToken: text('refresh_token'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const providerAccessRules = pgTable('provider_access_rules', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  subjectType: text('subject_type').notNull().$type<'user' | 'agent'>(),
  subjectId: text('subject_id').notNull(),
  providerId: text('provider_id').notNull(),
  action: text('action').notNull().$type<'allow' | 'deny' | 'require_confirmation'>(),
  toolPattern: text('tool_pattern').default('*'),
  confirmationMode: text('confirmation_mode').$type<'always' | 'never'>(),
  riskLevel: text('risk_level').$type<'low' | 'medium' | 'high' | 'critical'>(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const deviceTokens = pgTable('device_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id'),
  platform: text('platform').notNull().$type<'ios' | 'macos' | 'android'>(),
  pushToken: text('push_token').notNull(),
  deviceName: text('device_name'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  name: text('name').notNull(),
  scopes: text('scopes'),
  createdBy: text('created_by').notNull(),
  tenantId: text('tenant_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
});

// ==================== Type Exports ====================

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type Confirmation = typeof confirmations.$inferSelect;
export type NewConfirmation = typeof confirmations.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type ToolProvider = typeof toolProviders.$inferSelect;
export type NewToolProvider = typeof toolProviders.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;

export type CredentialProvider = typeof credentialProviders.$inferSelect;
export type NewCredentialProvider = typeof credentialProviders.$inferInsert;

export type UserCredential = typeof userCredentials.$inferSelect;
export type NewUserCredential = typeof userCredentials.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type ProviderAccessRule = typeof providerAccessRules.$inferSelect;
export type NewProviderAccessRule = typeof providerAccessRules.$inferInsert;

export type DeviceToken = typeof deviceTokens.$inferSelect;
export type NewDeviceToken = typeof deviceTokens.$inferInsert;
