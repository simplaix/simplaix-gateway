/**
 * Policy Engine Service
 * Evaluates tool calls against configured policy rules
 */

import { getConfig } from '../../config.js';
import type { PolicyRule, PolicyEvaluationResult, PolicyAction, RiskLevel, PolicyContext } from '../../types/index.js';
import { matchGlobPattern } from '../../utils/glob.js';

/**
 * Policy Engine - evaluates tool calls against rules
 */
class PolicyService {
  /**
   * Evaluate a tool call against configured policies
   * Returns the action to take and risk level
   *
   * @param toolNameOrContext - Either a tool name string (legacy) or full PolicyContext
   */
  evaluate(toolNameOrContext: string | PolicyContext): PolicyEvaluationResult {
    const context = typeof toolNameOrContext === 'string'
      ? { toolName: toolNameOrContext }
      : toolNameOrContext;

    const { toolName, tenantId, agentId, endUserId } = context;
    const config = getConfig();
    const rules = config.policies;

    // Log context for debugging
    if (tenantId || agentId || endUserId) {
      console.log(`[Policy] Evaluating: tool=${toolName}, tenant=${tenantId}, agent=${agentId}, endUser=${endUserId}`);
    }

    // Find matching rule (first match wins)
    // TODO: In the future, support tenant-specific and agent-specific rules
    for (const rule of rules) {
      if (matchGlobPattern(toolName, rule.tool)) {
        return {
          action: rule.action,
          risk: rule.risk,
          matchedRule: rule,
        };
      }
    }

    // Default: allow with low risk
    return {
      action: 'allow',
      risk: 'low',
    };
  }

  /**
   * Validate a policy rule
   */
  validateRule(rule: PolicyRule): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!rule.tool || typeof rule.tool !== 'string') {
      errors.push('tool is required and must be a string');
    }

    const validActions: PolicyAction[] = ['allow', 'deny', 'require_confirmation'];
    if (!rule.action || !validActions.includes(rule.action)) {
      errors.push(`action must be one of: ${validActions.join(', ')}`);
    }

    const validRisks: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    if (!rule.risk || !validRisks.includes(rule.risk)) {
      errors.push(`risk must be one of: ${validRisks.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get all configured policies
   */
  getPolicies(): PolicyRule[] {
    const config = getConfig();
    return config.policies;
  }

  /**
   * Add a new policy rule
   * Rules are evaluated in order, so position matters
   */
  addRule(rule: PolicyRule, position?: number): void {
    const validation = this.validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid policy rule: ${validation.errors.join(', ')}`);
    }

    const config = getConfig();
    if (position !== undefined && position >= 0 && position < config.policies.length) {
      config.policies.splice(position, 0, rule);
    } else {
      // Add before the default catch-all rule
      const catchAllIndex = config.policies.findIndex((r) => r.tool === '*');
      if (catchAllIndex >= 0) {
        config.policies.splice(catchAllIndex, 0, rule);
      } else {
        config.policies.push(rule);
      }
    }
  }

  /**
   * Remove a policy rule by tool pattern
   */
  removeRule(toolPattern: string): boolean {
    const config = getConfig();
    const index = config.policies.findIndex((r) => r.tool === toolPattern);
    if (index >= 0) {
      config.policies.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Update a policy rule
   */
  updateRule(toolPattern: string, updates: Partial<PolicyRule>): boolean {
    const config = getConfig();
    const rule = config.policies.find((r) => r.tool === toolPattern);
    if (rule) {
      Object.assign(rule, updates);
      return true;
    }
    return false;
  }

  /**
   * Calculate risk level for a tool
   * Utility method for determining risk without full evaluation
   */
  calculateRisk(toolNameOrContext: string | PolicyContext): RiskLevel {
    const result = this.evaluate(toolNameOrContext);
    return result.risk;
  }

  /**
   * Check if a tool requires confirmation
   */
  requiresConfirmation(toolNameOrContext: string | PolicyContext): boolean {
    const result = this.evaluate(toolNameOrContext);
    return result.action === 'require_confirmation';
  }

  /**
   * Check if a tool is denied
   */
  isDenied(toolNameOrContext: string | PolicyContext): boolean {
    const result = this.evaluate(toolNameOrContext);
    return result.action === 'deny';
  }
}

// Export singleton instance
export const policyService = new PolicyService();
