import type { UserContext } from '../../types/index.js';

type ConfirmationAccessTarget = {
  userId: string;
  endUserId?: string;
  tenantId?: string;
};

export type ConfirmationStatus = 'pending' | 'confirmed' | 'rejected' | 'expired' | 'consumed';

export function canAccessConfirmation(
  user: UserContext,
  confirmation: ConfirmationAccessTarget
): boolean {
  if (confirmation.userId === user.id) return true;
  if (confirmation.endUserId && confirmation.endUserId === user.id) return true;
  if (user.roles?.includes('admin') && confirmation.tenantId === user.tenantId) return true;
  return false;
}

export function parseConfirmationStatusFilter(value: string | undefined): ConfirmationStatus | undefined {
  if (!value) return undefined;
  if (['pending', 'confirmed', 'rejected', 'expired', 'consumed'].includes(value)) {
    return value as ConfirmationStatus;
  }
  return undefined;
}

export function parseJsonArguments(input: string | null | undefined): unknown {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function formatDbConfirmation(record: {
  requestId: string;
  status: string;
  toolName: string;
  arguments?: unknown;
  risk: string;
  createdAt: Date;
  resolvedAt?: Date | null;
  userId: string;
  endUserId?: string | null;
  providerId?: string | null;
  agentId?: string | null;
  ruleId?: string | null;
  tenantId?: string | null;
  confirmedBy?: string | null;
  reason?: string | null;
}) {
  return {
    confirmation_id: record.requestId,
    status: record.status,
    tool: record.toolName,
    arguments: record.arguments,
    risk: record.risk,
    created_at: record.createdAt.toISOString(),
    resolved_at: record.resolvedAt?.toISOString(),
    user_id: record.userId,
    end_user_id: record.endUserId,
    provider_id: record.providerId,
    agent_id: record.agentId,
    rule_id: record.ruleId,
    tenant_id: record.tenantId,
    confirmed_by: record.confirmedBy,
    reason: record.reason,
  };
}
