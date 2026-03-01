import type { Context, Hono } from 'hono';
import type { GatewayVariables, CreateAgentInput, UpdateAgentInput } from '../../types/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { agentService } from '../../services/agent.service/index.js';
import { parseJsonBody } from '../../modules/http/request.js';
import { resolveTenantScope } from '../../modules/authz/tenant-scope.js';
import { logger } from '../../utils/logger.js';
import {
  createAgentInputSchema,
  updateAgentInputSchema,
} from '../../modules/validation/agent.js';
import { canMutateAgent, serializeAgent } from './shared.js';

async function getAgentInScope(
  c: Context<{ Variables: GatewayVariables }>,
  agentId: string
) {
  const user = c.get('user');
  const agent = await agentService.getAgent(agentId);

  if (!agent) {
    return { response: c.json({ error: 'Agent not found' }, 404) } as const;
  }

  const { tenantId, isAdmin } = resolveTenantScope(user);
  if (!isAdmin && agent.tenantId && tenantId && agent.tenantId !== tenantId) {
    return { response: c.json({ error: 'Agent not found' }, 404) } as const;
  }

  return { agent } as const;
}

export function registerAdminAgentRoutes(adminRoutes: Hono<{ Variables: GatewayVariables }>) {
  adminRoutes.post('/agents', requirePermission('agent:create'), async (c) => {
    const user = c.get('user');

    const parsed = await parseJsonBody<CreateAgentInput>(c);
    if (!parsed.ok) return parsed.response;
    const validation = createAgentInputSchema.safeParse(parsed.data);
    if (!validation.success) {
      return c.json({ error: validation.error.issues[0]?.message || 'Invalid request body' }, 400);
    }
    const payload = validation.data;

    try {
      const { tenantId } = resolveTenantScope(user, payload.tenantId);
      const result = await agentService.createAgent({
        name: payload.name,
        upstreamUrl: payload.upstreamUrl,
        upstreamSecret: payload.upstreamSecret,
        requireConfirmation: payload.requireConfirmation,
        requiredCredentials: payload.requiredCredentials,
        tenantId,
        ownerUserId: payload.ownerUserId || user.id,
        description: payload.description,
      });

      return c.json({
        success: true,
        agent: serializeAgent(result),
        runtime_token: result.runtimeToken,
      }, 201);
    } catch (error) {
      logger.error('[Admin] Failed to create agent:', error);
      return c.json({ error: 'Failed to create agent' }, 500);
    }
  });

  adminRoutes.get('/agents', requirePermission('agent:read'), async (c) => {
    const user = c.get('user');
    const requestedTenantId = c.req.query('tenant_id') || undefined;
    const { tenantId } = resolveTenantScope(user, requestedTenantId);

    try {
      const agents = await agentService.listAgents(tenantId);
      return c.json({ agents: agents.map(serializeAgent) });
    } catch (error) {
      logger.error('[Admin] Failed to list agents:', error);
      return c.json({ error: 'Failed to list agents' }, 500);
    }
  });

  adminRoutes.get('/agents/:id', requirePermission('agent:read'), async (c) => {
    const scoped = await getAgentInScope(c, c.req.param('id'));
    if ('response' in scoped) return scoped.response;

    return c.json({
      agent: serializeAgent(scoped.agent),
    });
  });

  adminRoutes.put('/agents/:id', requirePermission('agent:update:own'), async (c) => {
    const user = c.get('user');
    const agentId = c.req.param('id');

    const parsed = await parseJsonBody<UpdateAgentInput>(c);
    if (!parsed.ok) return parsed.response;
    const validation = updateAgentInputSchema.safeParse(parsed.data);
    if (!validation.success) {
      return c.json({ error: validation.error.issues[0]?.message || 'Invalid request body' }, 400);
    }

    try {
      const scoped = await getAgentInScope(c, agentId);
      if ('response' in scoped) return scoped.response;
      if (!canMutateAgent(user, scoped.agent, 'update')) {
        return c.json({ error: 'Forbidden', message: 'Insufficient permissions to update this agent' }, 403);
      }

      const updated = await agentService.updateAgent(agentId, validation.data);
      if (!updated) {
        return c.json({ error: 'Agent not found' }, 404);
      }

      return c.json({ success: true, agent: serializeAgent(updated) });
    } catch (error) {
      logger.error('[Admin] Failed to update agent:', error);
      return c.json({ error: 'Failed to update agent' }, 500);
    }
  });

  adminRoutes.delete('/agents/:id', requirePermission('agent:delete:own'), async (c) => {
    const user = c.get('user');
    const agentId = c.req.param('id');

    try {
      const scoped = await getAgentInScope(c, agentId);
      if ('response' in scoped) return scoped.response;
      if (!canMutateAgent(user, scoped.agent, 'delete')) {
        return c.json({ error: 'Forbidden', message: 'Insufficient permissions to delete this agent' }, 403);
      }

      await agentService.deleteAgent(agentId);
      return c.json({ success: true, message: 'Agent deleted' });
    } catch (error) {
      logger.error('[Admin] Failed to delete agent:', error);
      return c.json({ error: 'Failed to delete agent' }, 500);
    }
  });

  adminRoutes.post('/agents/:id/disable', requirePermission('agent:update:own'), async (c) => {
    const user = c.get('user');
    const agentId = c.req.param('id');

    try {
      const scoped = await getAgentInScope(c, agentId);
      if ('response' in scoped) return scoped.response;
      if (!canMutateAgent(user, scoped.agent, 'update')) {
        return c.json({ error: 'Forbidden', message: 'Insufficient permissions to disable this agent' }, 403);
      }

      await agentService.disableAgent(agentId);
      return c.json({ success: true, message: 'Agent disabled' });
    } catch (error) {
      logger.error('[Admin] Failed to disable agent:', error);
      return c.json({ error: 'Failed to disable agent' }, 500);
    }
  });

  adminRoutes.post('/agents/:id/enable', requirePermission('agent:update:own'), async (c) => {
    const user = c.get('user');
    const agentId = c.req.param('id');

    try {
      const scoped = await getAgentInScope(c, agentId);
      if ('response' in scoped) return scoped.response;
      if (!canMutateAgent(user, scoped.agent, 'update')) {
        return c.json({ error: 'Forbidden', message: 'Insufficient permissions to enable this agent' }, 403);
      }

      await agentService.enableAgent(agentId);
      return c.json({ success: true, message: 'Agent enabled' });
    } catch (error) {
      logger.error('[Admin] Failed to enable agent:', error);
      return c.json({ error: 'Failed to enable agent' }, 500);
    }
  });

  adminRoutes.post('/agents/:id/regenerate-token', requirePermission('agent:update:own'), async (c) => {
    const user = c.get('user');
    const agentId = c.req.param('id');

    try {
      const scoped = await getAgentInScope(c, agentId);
      if ('response' in scoped) return scoped.response;
      if (!canMutateAgent(user, scoped.agent, 'update')) {
        return c.json({ error: 'Forbidden', message: 'Insufficient permissions to regenerate token for this agent' }, 403);
      }

      const result = await agentService.regenerateRuntimeToken(agentId);
      if (!result) {
        return c.json({ error: 'Agent not found' }, 404);
      }

      return c.json({
        success: true,
        agent: {
          id: result.agent.id,
          name: result.agent.name,
          runtimeTokenPrefix: result.agent.runtimeTokenPrefix,
        },
        runtime_token: result.runtimeToken,
      });
    } catch (error) {
      logger.error('[Admin] Failed to regenerate runtime token:', error);
      return c.json({ error: 'Failed to regenerate runtime token' }, 500);
    }
  });
}
