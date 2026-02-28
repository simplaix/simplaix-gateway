import type { ProviderAccessRule } from '../../types/index.js';
import { globPatternSpecificity } from '../../utils/glob.js';
import { logger } from '../../utils/logger.js';

export function selectBestToolPolicyRule(
  rules: ProviderAccessRule[],
  toolName: string
): ProviderAccessRule | null {
  const scoredRules = rules
    .map((rule) => {
      const toolScore = globPatternSpecificity(rule.toolPattern || '*', toolName);
      const subjectScore = rule.subjectType === 'user' ? 2 : 1;
      const actionScore = rule.action === 'deny' ? 3 : rule.action === 'require_confirmation' ? 2 : 1;

      logger.info(
        `[Policy]   Rule id=${rule.id}: pattern="${rule.toolPattern || '*'}" action=${rule.action} subject=${rule.subjectType}:${rule.subjectId} → toolScore=${toolScore}, subjectScore=${subjectScore}, actionScore=${actionScore}${toolScore < 0 ? ' (NO MATCH)' : ''}`
      );

      return { rule, toolScore, subjectScore, actionScore };
    })
    .filter((s) => s.toolScore >= 0)
    .sort((a, b) => {
      if (b.toolScore !== a.toolScore) return b.toolScore - a.toolScore;
      if (b.subjectScore !== a.subjectScore) return b.subjectScore - a.subjectScore;
      return b.actionScore - a.actionScore;
    });

  if (scoredRules.length === 0) return null;
  return scoredRules[0].rule;
}
