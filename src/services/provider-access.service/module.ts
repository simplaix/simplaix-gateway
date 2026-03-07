/**
 * Provider Access Service
 * Manages ACL rules for user/agent -> tool provider access control
 */

import { nanoid } from 'nanoid';
import { eq, and, or, desc, isNull, inArray } from 'drizzle-orm';
import { getDatabase } from '../../db/index.js';
import { providerAccessRules, toolProviders } from '../../db/schema.js';
import type {
  ProviderAccessRule,
  CreateProviderAccessRuleInput,
  AccessCheckResult,
  ToolPolicyResult,
} from '../../types/index.js';
import { policyService } from '../policy.service/index.js';
import { TTLCache } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import { normalizeProviderAccessRule } from '../provider-access/rule-normalizer.js';
import { evaluateProviderAccessFromRules } from '../provider-access/access-evaluator.js';
import { selectBestToolPolicyRule } from '../provider-access/tool-policy.js';

/**
 * Provider Access Service
 */
class ProviderAccessService {
  private accessCache = new TTLCache<AccessCheckResult>(60_000); // 60s TTL

  /**
   * Check provider-level access for an end-user and/or agent.
   *
   * @param userId  End-user ID (optional — when absent only agent rules apply)
   * @param agentId Agent ID (optional — when absent only user rules apply)
   */
  async checkAccess(
    userId: string | undefined,
    providerId: string,
    tenantId?: string,
    agentId?: string
  ): Promise<AccessCheckResult> {
    // Cache key includes subject/provider/tenant/agent to isolate evaluations correctly.
    const cacheKey = `${userId || ''}:${providerId}:${tenantId || ''}:${agentId || ''}`;
    const cached = this.accessCache.get(cacheKey);
    if (cached) return cached;

    const result = await this.evaluateAccess(userId, providerId, tenantId, agentId);
    this.accessCache.set(cacheKey, result);
    return result;
  }

  private async evaluateAccess(
    userId: string | undefined,
    providerId: string,
    tenantId?: string,
    agentId?: string
  ): Promise<AccessCheckResult> {
    const rules = await this.getRulesForAccess(userId, providerId, tenantId, agentId);
    return evaluateProviderAccessFromRules(rules, userId, agentId);
  }

  private async getRulesForAccess(
    userId: string | undefined,
    providerId: string,
    tenantId?: string,
    agentId?: string
  ): Promise<ProviderAccessRule[]> {
    const db = getDatabase();

    const matchesSubject = (row: { subjectType: string; subjectId: string }) => {
      if (row.subjectType === 'user' && userId && row.subjectId === userId) return true;
      if (row.subjectType === 'agent' && agentId && row.subjectId === agentId) return true;
      return false;
    };

    const providerIds = await this.resolveProviderIds(providerId);

    const results = await db
      .select()
      .from(providerAccessRules)
      .where(
        or(
          ...providerIds.map((id) => eq(providerAccessRules.providerId, id)),
          eq(providerAccessRules.providerId, '*')
        )
      );

    return results
      .filter((row) => row.tenantId === null || row.tenantId === tenantId)
      .filter(matchesSubject)
      .map((row) => normalizeProviderAccessRule(row));
  }

  /**
   * Resolve a providerId string to all matching internal IDs.
   *
   * The incoming providerId may be the internal DB ID itself, or a label/name
   * used by external clients (e.g. the OpenClaw plugin sends "openclaw").
   * We return all IDs that should be checked for matching rules.
   */
  private async resolveProviderIds(providerId: string): Promise<string[]> {
    const ids = new Set<string>([providerId]);

    const db = getDatabase();
    const matches = await db
      .select({ id: toolProviders.id })
      .from(toolProviders)
      .where(
        or(
          eq(toolProviders.id, providerId),
          eq(toolProviders.name, providerId)
        )
      );

    for (const row of matches) {
      ids.add(row.id);
    }

    return Array.from(ids);
  }

  // ==================== CRUD ====================

  async createRule(data: CreateProviderAccessRuleInput): Promise<ProviderAccessRule> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();

    await db.insert(providerAccessRules).values({
      id,
      tenantId: data.tenantId || null,
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      providerId: data.providerId,
      action: data.action,
      toolPattern: data.toolPattern || '*',
      confirmationMode: data.confirmationMode || null,
      riskLevel: data.riskLevel || null,
      description: data.description || null,
      createdAt: now,
    });

    this.accessCache.invalidate();
    this.policyCache.invalidate();

    return {
      id,
      tenantId: data.tenantId,
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      providerId: data.providerId,
      action: data.action,
      toolPattern: data.toolPattern || '*',
      confirmationMode: data.confirmationMode || null,
      riskLevel: data.riskLevel || null,
      description: data.description || null,
      createdAt: now,
    };
  }

  async listRules(filters?: {
    tenantId?: string;
    providerId?: string;
    subjectType?: string;
    subjectId?: string;
    action?: string;
    toolPattern?: string;
  }): Promise<ProviderAccessRule[]> {
    const db = getDatabase();

    let results = await db
      .select()
      .from(providerAccessRules)
      .orderBy(desc(providerAccessRules.createdAt));

    if (filters) {
      if (filters.tenantId) {
        results = results.filter(
          (r) => r.tenantId === null || r.tenantId === filters.tenantId
        );
      }
      if (filters.providerId) {
        results = results.filter((r) => r.providerId === filters.providerId);
      }
      if (filters.subjectType) {
        results = results.filter((r) => r.subjectType === filters.subjectType);
      }
      if (filters.subjectId) {
        results = results.filter((r) => r.subjectId === filters.subjectId);
      }
      if (filters.action) {
        results = results.filter((r) => r.action === filters.action);
      }
      if (filters.toolPattern) {
        results = results.filter((r) => (r.toolPattern || '*') === filters.toolPattern);
      }
    }

    return results.map((row) => normalizeProviderAccessRule(row));
  }

  async getRule(id: string): Promise<ProviderAccessRule | null> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(providerAccessRules)
      .where(eq(providerAccessRules.id, id))
      .limit(1);

    if (results.length === 0) return null;
    return normalizeProviderAccessRule(results[0]);
  }

  async updateRule(
    id: string,
    data: Partial<Omit<CreateProviderAccessRuleInput, 'tenantId'>>
  ): Promise<ProviderAccessRule | null> {
    const db = getDatabase();
    const now = new Date();

    const updateValues: Record<string, unknown> = { updatedAt: now };
    if (data.subjectType !== undefined) updateValues.subjectType = data.subjectType;
    if (data.subjectId !== undefined) updateValues.subjectId = data.subjectId;
    if (data.providerId !== undefined) updateValues.providerId = data.providerId;
    if (data.action !== undefined) updateValues.action = data.action;
    if (data.toolPattern !== undefined) updateValues.toolPattern = data.toolPattern;
    if (data.confirmationMode !== undefined) updateValues.confirmationMode = data.confirmationMode;
    if (data.riskLevel !== undefined) updateValues.riskLevel = data.riskLevel;
    if (data.description !== undefined) updateValues.description = data.description;

    await db
      .update(providerAccessRules)
      .set(updateValues as Partial<typeof providerAccessRules.$inferInsert>)
      .where(eq(providerAccessRules.id, id));

    this.accessCache.invalidate();
    this.policyCache.invalidate();

    return this.getRule(id);
  }

  async deleteRule(id: string): Promise<boolean> {
    const db = getDatabase();

    await db
      .delete(providerAccessRules)
      .where(eq(providerAccessRules.id, id));

    this.accessCache.invalidate();
    this.policyCache.invalidate();
    return true;
  }

  async deleteRulesForProvider(providerId: string): Promise<void> {
    const db = getDatabase();
    await db
      .delete(providerAccessRules)
      .where(eq(providerAccessRules.providerId, providerId));
  }

  /**
   * Atomically replace all rules for a specific agent within a tenant scope.
   * Prevents partial state when bulk update fails midway.
   */
  async replaceAgentRules(
    tenantId: string | undefined,
    agentId: string,
    rules: Array<{
      providerId: string;
      action: ProviderAccessRule['action'];
      toolPattern?: string;
      riskLevel?: ProviderAccessRule['riskLevel'];
      description?: string;
    }>
  ): Promise<ProviderAccessRule[]> {
    const db = getDatabase();
    const now = new Date();

    const inserted = await db.transaction(async (tx) => {
      // Delete-then-insert inside a single transaction to avoid partial updates.
      await tx
        .delete(providerAccessRules)
        .where(
          and(
            eq(providerAccessRules.subjectType, 'agent'),
            eq(providerAccessRules.subjectId, agentId),
            tenantId ? eq(providerAccessRules.tenantId, tenantId) : isNull(providerAccessRules.tenantId)
          )
        );

      if (rules.length === 0) return [];

      const values = rules.map((rule) => ({
        id: nanoid(),
        tenantId: tenantId || null,
        subjectType: 'agent' as const,
        subjectId: agentId,
        providerId: rule.providerId,
        action: rule.action,
        toolPattern: rule.toolPattern || '*',
        riskLevel: rule.riskLevel || null,
        description: rule.description || null,
        createdAt: now,
      }));

      return tx.insert(providerAccessRules).values(values).returning();
    });

    this.accessCache.invalidate();
    this.policyCache.invalidate();
    return inserted.map((row) => normalizeProviderAccessRule(row));
  }

  // ==================== Tool-Level Policy Evaluation ====================

  private policyCache = new TTLCache<ToolPolicyResult>(60_000); // 60s TTL

  async evaluateToolPolicy(
    userId: string | undefined,
    providerId: string,
    toolName: string,
    tenantId?: string,
    agentId?: string
  ): Promise<ToolPolicyResult> {
    const cacheKey = `tp:${userId || ''}:${providerId}:${toolName}:${tenantId || ''}:${agentId || ''}`;
    const cached = this.policyCache.get(cacheKey);
    if (cached) {
      logger.info(
        `[Policy] Cache HIT — tool=${toolName}, endUser=${userId || 'none'}, agent=${agentId || 'none'}, provider=${providerId}, action=${cached.action}, risk=${cached.risk}`
      );
      return cached;
    }

    logger.info(
      `[Policy] Evaluating — tool=${toolName}, endUser=${userId || 'none'}, agent=${agentId || 'none'}, provider=${providerId}, tenant=${tenantId || 'none'}`
    );
    const result = await this.doEvaluateToolPolicy(userId, providerId, toolName, tenantId, agentId);
    this.policyCache.set(cacheKey, result);

    logger.info(
      `[Policy] Result — tool=${toolName}, action=${result.action}, risk=${result.risk}, matchedRule=${result.matchedRule ? `id=${result.matchedRule.id} pattern=${result.matchedRule.toolPattern} subject=${result.matchedRule.subjectType}:${result.matchedRule.subjectId}` : 'none (fallback)'}`
    );
    return result;
  }

  private async doEvaluateToolPolicy(
    userId: string | undefined,
    providerId: string,
    toolName: string,
    tenantId?: string,
    agentId?: string
  ): Promise<ToolPolicyResult> {
    const rules = await this.getRulesForAccess(userId, providerId, tenantId, agentId);

    logger.info(
      `[Policy]   DB rules fetched: ${rules.length} rule(s) for endUser=${userId || 'none'}, provider=${providerId}`
    );

    if (rules.length === 0) {
      logger.info(`[Policy]   No DB rules found → falling back to config-based policy`);
      return this.fallbackToConfigPolicy(toolName);
    }

    const rule = selectBestToolPolicyRule(rules, toolName);
    if (!rule) {
      logger.info(`[Policy]   Rules exist but none match tool "${toolName}" → deny (whitelist model)`);
      return { action: 'deny', risk: 'low', matchedRule: undefined };
    }

    logger.info(
      `[Policy]   Winner: rule id=${rule.id}, action=${rule.action}, risk=${rule.riskLevel || 'medium'}, pattern="${rule.toolPattern || '*'}"`
    );

    return {
      action: rule.action,
      risk: rule.riskLevel || 'medium',
      matchedRule: rule,
    };
  }

  private fallbackToConfigPolicy(toolName: string): ToolPolicyResult {
    const result = policyService.evaluate(toolName);
    logger.info(
      `[Policy]   Config fallback: tool=${toolName}, action=${result.action}, risk=${result.risk}${result.matchedRule ? `, configRule="${result.matchedRule.tool}"` : ''}`
    );
    return {
      action: result.action,
      risk: result.risk,
    };
  }
}

// Export singleton instance
export const providerAccessService = new ProviderAccessService();
