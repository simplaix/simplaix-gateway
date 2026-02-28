import type { UserContext } from '../../types/index.js';

export interface TenantScopeResult {
  tenantId: string | undefined;
  isAdmin: boolean;
}

/**
 * Resolve effective tenant scope for admin routes.
 * - admin: can optionally specify another tenant
 * - tenant_admin and others: always pinned to own tenant
 */
export function resolveTenantScope(
  user: UserContext,
  requestedTenantId?: string
): TenantScopeResult {
  const isAdmin = Boolean(user.roles?.includes('admin'));
  if (isAdmin) {
    return { tenantId: requestedTenantId || user.tenantId, isAdmin: true };
  }
  return { tenantId: user.tenantId, isAdmin: false };
}

export function isSameTenant(a?: string | null, b?: string | null): boolean {
  // Treat missing tenant as non-restrictive (global/admin records).
  if (!a || !b) return true;
  return a === b;
}
