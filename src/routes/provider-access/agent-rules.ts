import type { Hono } from 'hono';
import type { AccessAction, GatewayVariables, RiskLevel } from '../../types/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { providerAccessService } from '../../services/provider-access.service/index.js';
import { isValidAction, isValidRiskLevel, serializeRule, VALID_ACTIONS, VALID_RISK_LEVELS } from './shared.js';

export function registerProviderAccessAgentRoutes(
  providerAccessRoutes: Hono<{ Variables: GatewayVariables }>
) {
  providerAccessRoutes.get('/agent/:agentId', requirePermission('provider:update'), async (c) => {
    const { agentId } = c.req.param();
    const user = c.get('user');

    try {
      const allRules = await providerAccessService.listRules({
        subjectType: 'agent',
        subjectId: agentId,
        tenantId: user.tenantId,
      });

      return c.json({
        agentId,
        rules: allRules.map(serializeRule),
      });
    } catch (error) {
      console.error('[ProviderAccess] Failed to get agent rules:', error);
      return c.json({ error: 'Failed to get agent provider access rules' }, 500);
    }
  });

  providerAccessRoutes.put('/agent/:agentId', requirePermission('provider:update'), async (c) => {
    const { agentId } = c.req.param();
    const user = c.get('user');

    let body: {
      rules: Array<{
        providerId: string;
        action: string;
        toolPattern?: string;
        riskLevel?: string;
        description?: string;
      }>;
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!Array.isArray(body.rules)) {
      return c.json({ error: 'rules must be an array' }, 400);
    }

    try {
      for (const rule of body.rules) {
        if (!rule.providerId || typeof rule.providerId !== 'string') {
          return c.json({ error: 'providerId is required for every rule' }, 400);
        }
        if (!isValidAction(rule.action)) {
          return c.json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }, 400);
        }
        if (rule.riskLevel && !isValidRiskLevel(rule.riskLevel)) {
          return c.json({ error: `riskLevel must be one of: ${VALID_RISK_LEVELS.join(', ')}` }, 400);
        }
      }

      const created = await providerAccessService.replaceAgentRules(
        user.tenantId,
        agentId,
        body.rules.map((rule) => ({
          providerId: rule.providerId,
          action: rule.action as AccessAction,
          toolPattern: rule.toolPattern || '*',
          riskLevel: rule.riskLevel as RiskLevel | undefined,
          description: rule.description,
        }))
      );

      return c.json({
        agentId,
        rules: created.map(serializeRule),
      });
    } catch (error) {
      console.error('[ProviderAccess] Failed to set agent rules:', error);
      return c.json({ error: 'Failed to set agent provider access rules' }, 500);
    }
  });
}
