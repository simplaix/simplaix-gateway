import type { AccessCheckResult, ProviderAccessRule } from '../../types/index.js';

export function evaluateProviderAccessFromRules(
  rules: ProviderAccessRule[],
  userId: string | undefined,
  agentId?: string
): AccessCheckResult {
  if (rules.length === 0) {
    return { allowed: false, reason: 'No access rules configured (default deny — whitelist model)' };
  }

  const grantsAccess = (action: string) => action === 'allow' || action === 'require_confirmation';

  if (userId) {
    const userDeny = rules.find(
      (r) => r.subjectType === 'user' && r.subjectId === userId && r.action === 'deny'
    );
    if (userDeny) return { allowed: false, reason: 'End-user explicitly denied', matchedRule: userDeny };

    const userGrant = rules.find(
      (r) => r.subjectType === 'user' && r.subjectId === userId && grantsAccess(r.action)
    );
    if (userGrant) return { allowed: true, reason: `End-user explicitly ${userGrant.action}`, matchedRule: userGrant };
  }

  if (agentId) {
    const agentDeny = rules.find(
      (r) => r.subjectType === 'agent' && r.subjectId === agentId && r.action === 'deny'
    );
    if (agentDeny) return { allowed: false, reason: `Agent '${agentId}' explicitly denied`, matchedRule: agentDeny };

    const agentGrant = rules.find(
      (r) => r.subjectType === 'agent' && r.subjectId === agentId && grantsAccess(r.action)
    );
    if (agentGrant) return { allowed: true, reason: `Agent '${agentId}' explicitly ${agentGrant.action}`, matchedRule: agentGrant };
  }

  const wildcardDeny = rules.find(
    (r) => r.providerId === '*' && r.action === 'deny' &&
    ((userId && r.subjectType === 'user' && r.subjectId === userId) ||
     (agentId && r.subjectType === 'agent' && r.subjectId === agentId))
  );
  if (wildcardDeny) return { allowed: false, reason: 'Wildcard provider deny rule', matchedRule: wildcardDeny };

  const wildcardGrant = rules.find(
    (r) => r.providerId === '*' && grantsAccess(r.action) &&
    ((userId && r.subjectType === 'user' && r.subjectId === userId) ||
     (agentId && r.subjectType === 'agent' && r.subjectId === agentId))
  );
  if (wildcardGrant) return { allowed: true, reason: `Wildcard provider ${wildcardGrant.action} rule`, matchedRule: wildcardGrant };

  return { allowed: false, reason: 'No matching access rule (default deny — whitelist model)' };
}
