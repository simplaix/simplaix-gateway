import type {
  AccessAction,
  AccessSubjectType,
  ProviderAccessRule,
  RiskLevel,
} from '../../types/index.js';

export const VALID_SUBJECT_TYPES: AccessSubjectType[] = ['user', 'agent'];
export const VALID_ACTIONS: AccessAction[] = ['allow', 'deny', 'require_confirmation'];
export const VALID_RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

export function serializeRule(rule: ProviderAccessRule) {
  return {
    id: rule.id,
    tenantId: rule.tenantId,
    subjectType: rule.subjectType,
    subjectId: rule.subjectId,
    providerId: rule.providerId,
    action: rule.action,
    toolPattern: rule.toolPattern || '*',
    confirmationMode: rule.confirmationMode || null,
    riskLevel: rule.riskLevel || null,
    description: rule.description || null,
    createdAt: rule.createdAt instanceof Date ? rule.createdAt.toISOString() : rule.createdAt,
    updatedAt: rule.updatedAt instanceof Date ? rule.updatedAt.toISOString() : rule.updatedAt || null,
  };
}

export function isValidSubjectType(value: string | undefined): value is AccessSubjectType {
  return !!value && VALID_SUBJECT_TYPES.includes(value as AccessSubjectType);
}

export function isValidAction(value: string | undefined): value is AccessAction {
  return !!value && VALID_ACTIONS.includes(value as AccessAction);
}

export function isValidRiskLevel(value: string | undefined): value is RiskLevel {
  return !!value && VALID_RISK_LEVELS.includes(value as RiskLevel);
}
