import type { Hono } from 'hono';
import type { AccessAction, AccessSubjectType, GatewayVariables, RiskLevel } from '../../types/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { providerAccessService } from '../../services/provider-access.service/index.js';
import { toolProviderService } from '../../services/tool-provider.service/index.js';
import {
  isValidAction,
  isValidRiskLevel,
  isValidSubjectType,
  serializeRule,
  VALID_ACTIONS,
  VALID_RISK_LEVELS,
  VALID_SUBJECT_TYPES,
} from './shared.js';

export function registerProviderAccessRuleRoutes(
  providerAccessRoutes: Hono<{ Variables: GatewayVariables }>
) {
  providerAccessRoutes.get('/', requirePermission('provider:read'), async (c) => {
    const user = c.get('user');

    const providerId = c.req.query('provider_id') || undefined;
    const subjectType = c.req.query('subject_type') || undefined;
    const subjectId = c.req.query('subject_id') || undefined;
    const action = c.req.query('action') || undefined;
    const toolPattern = c.req.query('tool_pattern') || undefined;

    try {
      const rules = await providerAccessService.listRules({
        tenantId: user.tenantId,
        providerId,
        subjectType,
        subjectId,
        action,
        toolPattern,
      });

      return c.json({ rules: rules.map(serializeRule) });
    } catch (error) {
      console.error('[ProviderAccess] Failed to list rules:', error);
      return c.json({ error: 'Failed to list access rules' }, 500);
    }
  });

  providerAccessRoutes.get('/by-provider/:providerId', requirePermission('provider:read'), async (c) => {
    const user = c.get('user');
    const providerId = c.req.param('providerId');

    try {
      const rules = await providerAccessService.listRules({
        tenantId: user.tenantId,
        providerId,
      });

      const grouped: Record<string, typeof rules> = {};
      for (const rule of rules) {
        const pattern = rule.toolPattern || '*';
        if (!grouped[pattern]) grouped[pattern] = [];
        grouped[pattern].push(rule);
      }

      return c.json({
        providerId,
        groups: Object.entries(grouped).map(([pattern, patternRules]) => ({
          toolPattern: pattern,
          rules: patternRules.map(serializeRule),
        })),
      });
    } catch (error) {
      console.error('[ProviderAccess] Failed to list rules by provider:', error);
      return c.json({ error: 'Failed to list access rules' }, 500);
    }
  });

  providerAccessRoutes.get('/:id', requirePermission('provider:read'), async (c) => {
    const ruleId = c.req.param('id');

    try {
      const rule = await providerAccessService.getRule(ruleId);
      if (!rule) {
        return c.json({ error: 'Access rule not found' }, 404);
      }

      return c.json({ rule: serializeRule(rule) });
    } catch (error) {
      console.error('[ProviderAccess] Failed to get rule:', error);
      return c.json({ error: 'Failed to get access rule' }, 500);
    }
  });

  providerAccessRoutes.post('/', requirePermission('provider:update'), async (c) => {
    const user = c.get('user');

    let body: {
      tenantId?: string;
      subjectType: string;
      subjectId: string;
      providerId: string;
      action: string;
      toolPattern?: string;
      confirmationMode?: string;
      riskLevel?: string;
      description?: string;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!isValidSubjectType(body.subjectType)) {
      return c.json({ error: `subjectType must be one of: ${VALID_SUBJECT_TYPES.join(', ')}` }, 400);
    }
    if (!body.subjectId || typeof body.subjectId !== 'string') {
      return c.json({ error: 'subjectId is required' }, 400);
    }
    if (!body.providerId || typeof body.providerId !== 'string') {
      return c.json({ error: 'providerId is required' }, 400);
    }
    if (!isValidAction(body.action)) {
      return c.json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }, 400);
    }
    if (body.confirmationMode && !['always', 'never'].includes(body.confirmationMode)) {
      return c.json({ error: 'confirmationMode must be "always" or "never"' }, 400);
    }
    if (body.riskLevel && !isValidRiskLevel(body.riskLevel)) {
      return c.json({ error: `riskLevel must be one of: ${VALID_RISK_LEVELS.join(', ')}` }, 400);
    }

    if (body.providerId !== '*') {
      const provider = await toolProviderService.getProvider(body.providerId);
      if (!provider) {
        return c.json({ error: `Tool provider '${body.providerId}' not found` }, 404);
      }
    }

    try {
      const rule = await providerAccessService.createRule({
        tenantId: body.tenantId || user.tenantId,
        subjectType: body.subjectType,
        subjectId: body.subjectId,
        providerId: body.providerId,
        action: body.action,
        toolPattern: body.toolPattern,
        confirmationMode: body.confirmationMode as 'always' | 'never' | undefined,
        riskLevel: body.riskLevel as RiskLevel | undefined,
        description: body.description,
      });

      return c.json({ success: true, rule: serializeRule(rule) }, 201);
    } catch (error) {
      console.error('[ProviderAccess] Failed to create rule:', error);
      return c.json({ error: 'Failed to create access rule' }, 500);
    }
  });

  providerAccessRoutes.put('/:id', requirePermission('provider:update'), async (c) => {
    const ruleId = c.req.param('id');

    let body: {
      subjectType?: string;
      subjectId?: string;
      providerId?: string;
      action?: string;
      toolPattern?: string;
      confirmationMode?: string | null;
      riskLevel?: string | null;
      description?: string | null;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const existing = await providerAccessService.getRule(ruleId);
    if (!existing) {
      return c.json({ error: 'Access rule not found' }, 404);
    }

    if (body.subjectType && !isValidSubjectType(body.subjectType)) {
      return c.json({ error: `subjectType must be one of: ${VALID_SUBJECT_TYPES.join(', ')}` }, 400);
    }
    if (body.action && !isValidAction(body.action)) {
      return c.json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }, 400);
    }
    if (body.confirmationMode && !['always', 'never'].includes(body.confirmationMode)) {
      return c.json({ error: 'confirmationMode must be "always" or "never"' }, 400);
    }
    if (body.riskLevel && !isValidRiskLevel(body.riskLevel)) {
      return c.json({ error: `riskLevel must be one of: ${VALID_RISK_LEVELS.join(', ')}` }, 400);
    }

    try {
      const updated = await providerAccessService.updateRule(ruleId, {
        subjectType: body.subjectType as AccessSubjectType | undefined,
        subjectId: body.subjectId,
        providerId: body.providerId,
        action: body.action as AccessAction | undefined,
        toolPattern: body.toolPattern,
        confirmationMode: body.confirmationMode as 'always' | 'never' | undefined,
        riskLevel: body.riskLevel as RiskLevel | undefined,
        description: body.description ?? undefined,
      });

      if (!updated) {
        return c.json({ error: 'Failed to update access rule' }, 500);
      }

      return c.json({ success: true, rule: serializeRule(updated) });
    } catch (error) {
      console.error('[ProviderAccess] Failed to update rule:', error);
      return c.json({ error: 'Failed to update access rule' }, 500);
    }
  });

  providerAccessRoutes.delete('/:id', requirePermission('provider:update'), async (c) => {
    const ruleId = c.req.param('id');

    try {
      const rule = await providerAccessService.getRule(ruleId);
      if (!rule) {
        return c.json({ error: 'Access rule not found' }, 404);
      }

      await providerAccessService.deleteRule(ruleId);
      return c.json({ success: true, message: 'Access rule deleted' });
    } catch (error) {
      console.error('[ProviderAccess] Failed to delete rule:', error);
      return c.json({ error: 'Failed to delete access rule' }, 500);
    }
  });

  providerAccessRoutes.post('/evaluate', requirePermission('provider:update'), async (c) => {
    let body: {
      userId: string;
      providerId: string;
      toolName: string;
      agentId?: string;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.userId || !body.providerId || !body.toolName) {
      return c.json({ error: 'userId, providerId, and toolName are required' }, 400);
    }

    const user = c.get('user');

    try {
      const result = await providerAccessService.evaluateToolPolicy(
        body.userId,
        body.providerId,
        body.toolName,
        user.tenantId,
        body.agentId
      );

      return c.json({
        action: result.action,
        risk: result.risk,
        matchedRule: result.matchedRule ? serializeRule(result.matchedRule) : null,
      });
    } catch (error) {
      console.error('[ProviderAccess] Failed to evaluate policy:', error);
      return c.json({ error: 'Failed to evaluate policy' }, 500);
    }
  });
}
