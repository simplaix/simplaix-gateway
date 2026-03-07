import type { ProviderAccessRule } from '../../types/index.js';

export function normalizeProviderAccessRule(row: Record<string, unknown>): ProviderAccessRule {
  return {
    id: String(row.id),
    tenantId: (row.tenantId || row.tenant_id || null) as string | null,
    subjectType: (row.subjectType || row.subject_type) as ProviderAccessRule['subjectType'],
    subjectId: String(row.subjectId || row.subject_id),
    providerId: String(row.providerId || row.provider_id),
    action: (row.action || 'deny') as ProviderAccessRule['action'],
    toolPattern: String(row.toolPattern || row.tool_pattern || '*'),
    confirmationMode: (row.confirmationMode || row.confirmation_mode || null) as ProviderAccessRule['confirmationMode'],
    riskLevel: (row.riskLevel || row.risk_level || null) as ProviderAccessRule['riskLevel'],
    description: (row.description || null) as string | null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt
        : new Date((row.createdAt || row.created_at) as string | number | Date),
    updatedAt: row.updatedAt || row.updated_at
      ? row.updatedAt instanceof Date
        ? row.updatedAt
        : new Date((row.updatedAt || row.updated_at) as string | number | Date)
      : null,
  };
}
