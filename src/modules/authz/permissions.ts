import type { UserContext } from '../../types/index.js';

export type GatewayPermission =
  | 'agent:create'
  | 'agent:read'
  | 'agent:update:own'
  | 'agent:update:all'
  | 'agent:delete:own'
  | 'agent:delete:all'
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete'
  | 'user:assign_role'
  | 'provider:create'
  | 'provider:read'
  | 'provider:update'
  | 'provider:delete'
  | 'audit:read'
  | 'audit:read:all'
  | 'confirmation:respond';

// Central permission-to-role mapping used by route guards and helper checks.
export const PERMISSION_ROLES: Readonly<Record<GatewayPermission, readonly string[]>> = {
  'agent:create': ['admin', 'tenant_admin', 'agent_creator'],
  'agent:read': ['admin', 'tenant_admin', 'agent_creator'],
  'agent:update:own': ['admin', 'tenant_admin', 'agent_creator'],
  'agent:update:all': ['admin', 'tenant_admin'],
  'agent:delete:own': ['admin', 'tenant_admin', 'agent_creator'],
  'agent:delete:all': ['admin', 'tenant_admin'],
  'user:create': ['admin'],
  'user:read': ['admin', 'tenant_admin'],
  'user:update': ['admin'],
  'user:delete': ['admin'],
  'user:assign_role': ['admin'],
  'provider:create': ['admin', 'tenant_admin'],
  'provider:read': ['admin', 'tenant_admin', 'agent_creator'],
  'provider:update': ['admin', 'tenant_admin'],
  'provider:delete': ['admin', 'tenant_admin'],
  'audit:read': ['admin', 'tenant_admin', 'agent_creator'],
  'audit:read:all': ['admin'],
  'confirmation:respond': ['admin', 'tenant_admin', 'agent_creator'],
};

export function hasPermissionFromRoles(
  userRoles: readonly string[] | undefined,
  permission: string
): boolean {
  // Fail closed: unknown permissions are treated as denied.
  const requiredRoles = PERMISSION_ROLES[permission as GatewayPermission];
  if (!requiredRoles) return false;
  const roles = userRoles || [];
  return requiredRoles.some((role) => roles.includes(role));
}

export function hasPermission(user: UserContext, permission: string): boolean {
  return hasPermissionFromRoles(user.roles, permission);
}

export function isKnownPermission(permission: string): boolean {
  return Object.prototype.hasOwnProperty.call(PERMISSION_ROLES, permission);
}
