import { hasPermission } from '../../modules/authz/permissions.js';
import type { UserRole } from '../../services/user.service/index.js';

export interface AdminRouteUser {
  id: string;
  tenantId?: string;
  roles?: string[];
}

export interface AgentLike {
  id: string;
  name: string;
  upstreamUrl: string;
  upstreamSecret?: string | null;
  isActive: boolean;
  requireConfirmation: boolean;
  requiredCredentials?: unknown;
  tenantId?: string | null;
  ownerUserId?: string | null;
  description?: string | null;
  runtimeTokenPrefix?: string | null;
  createdAt: Date;
  updatedAt?: Date | null;
}

export interface UserLike {
  id: string;
  email: string;
  name?: string | null;
  tenantId?: string | null;
  isActive: boolean;
  roles: string[];
  createdAt: Date;
  updatedAt?: Date | null;
}

export const VALID_USER_ROLES: UserRole[] = ['admin', 'agent_creator', 'tenant_admin'];
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canMutateAgent(
  user: AdminRouteUser,
  agent: { ownerUserId?: string | null },
  mode: 'update' | 'delete'
): boolean {
  const allPermission = mode === 'update' ? 'agent:update:all' : 'agent:delete:all';
  const ownPermission = mode === 'update' ? 'agent:update:own' : 'agent:delete:own';

  if (hasPermission(user, allPermission)) return true;
  return hasPermission(user, ownPermission) && agent.ownerUserId === user.id;
}

export function serializeAgent(agent: AgentLike) {
  return {
    id: agent.id,
    name: agent.name,
    upstreamUrl: agent.upstreamUrl,
    hasUpstreamSecret: !!agent.upstreamSecret,
    isActive: agent.isActive,
    requireConfirmation: agent.requireConfirmation,
    requiredCredentials: agent.requiredCredentials,
    tenantId: agent.tenantId,
    ownerUserId: agent.ownerUserId,
    description: agent.description,
    runtimeTokenPrefix: agent.runtimeTokenPrefix,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt?.toISOString(),
  };
}

export function serializeUser(user: UserLike) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    isActive: user.isActive,
    roles: user.roles,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}
