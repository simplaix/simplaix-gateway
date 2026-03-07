import type { Context } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { providerAccessService } from '../../services/provider-access.service/index.js';
import { auditService } from '../../services/audit.service/index.js';
import { executeConfirmationFlow } from '../../services/confirmation-flow.service/index.js';
import { resolveEndUserIdentity } from '../../services/mcp-proxy.service/index.js';
import { logger } from '../../utils/logger.js';

/**
 * POST /evaluate
 *
 * Evaluates tool-call policy and returns a decision.
 * For `require_confirmation` the HTTP connection is held until the
 * confirmation is resolved (approved / rejected / timeout).
 */
export async function handleEvaluate(c: Context<{ Variables: GatewayVariables }>) {
  const body = await c.req.json<{
    toolName: string;
    providerId: string;
    params?: Record<string, unknown>;
    agentId?: string;
    sessionKey?: string;
  }>();

  if (!body.toolName) {
    return c.json({ error: 'Missing required field: toolName' }, 400);
  }
  if (!body.providerId) {
    return c.json({ error: 'Missing required field: providerId' }, 400);
  }

  const user = c.get('user');
  const agent = c.get('agent');

  // Resolve end-user via session token (same logic as MCP proxy) so that
  // push notifications target the correct human user.
  const endUser = await resolveEndUserIdentity(
    user,
    c.req.header('X-Gateway-Session-Token'),
    c.req.header('X-End-User-Id'),
  );
  const endUserId = endUser.endUserId;
  const tenantId = endUser.endUserTenantId || user.tenantId;
  const agentId = body.agentId || agent?.id;
  const { providerId } = body;
  const startTime = Date.now();

  const policyResult = await providerAccessService.evaluateToolPolicy(
    endUserId,
    providerId,
    body.toolName,
    tenantId,
    agentId,
  );

  logger.info(
    `[ToolGate] Policy decision: tool=${body.toolName}, action=${policyResult.action}, risk=${policyResult.risk}, provider=${providerId}, endUser=${endUserId}, agent=${agentId || 'none'}`,
  );

  // ── deny ──────────────────────────────────────────────────────────
  if (policyResult.action === 'deny') {
    const auditId = await auditService.log({
      userId: endUserId,
      tenantId,
      agentId,
      endUserId,
      providerId,
      toolName: body.toolName,
      arguments: body.params,
      status: 'failed',
    }).catch((err) => {
      logger.warn('[ToolGate] Audit log create failed:', err);
      return undefined;
    });

    return c.json({
      decision: 'denied',
      risk: policyResult.risk,
      auditId: auditId ?? null,
    });
  }

  // ── require_confirmation ──────────────────────────────────────────
  if (policyResult.action === 'require_confirmation') {
    logger.info(
      `[ToolGate] Tool ${body.toolName} requires confirmation (endUser=${endUserId}, agent=${agentId || 'none'})`,
    );

    const { pendingAuditId, result: confirmationResult } =
      await executeConfirmationFlow({
        userId: user.id,
        tenantId,
        endUserId,
        toolName: body.toolName,
        arguments: body.params,
        risk: policyResult.risk,
        providerId,
        agentId,
        agentName: agent?.name,
        ruleId: policyResult.matchedRule?.id,
      });

    const duration = Date.now() - startTime;

    if (!confirmationResult.confirmed) {
      const isTimeout = confirmationResult.reason === 'Request timed out';

      if (pendingAuditId) {
        auditService.updateStatus(
          pendingAuditId,
          'failed',
          { rejected: true, reason: confirmationResult.reason },
          duration,
        ).catch(() => {});
      }

      return c.json({
        decision: isTimeout ? 'timeout' : 'rejected',
        reason: confirmationResult.reason || null,
        auditId: pendingAuditId ?? null,
      });
    }

    if (pendingAuditId) {
      auditService.updateStatus(pendingAuditId, 'completed', undefined, duration).catch(() => {});
    }

    return c.json({
      decision: 'confirmed',
      confirmedBy: confirmationResult.confirmedBy || null,
      auditId: pendingAuditId ?? null,
    });
  }

  // ── allow (default) ───────────────────────────────────────────────
  const auditId = await auditService.log({
    userId: endUserId,
    tenantId,
    agentId,
    endUserId,
    providerId,
    toolName: body.toolName,
    arguments: body.params,
    status: 'pending',
  }).catch((err) => {
    logger.warn('[ToolGate] Audit log create failed:', err);
    return undefined;
  });

  return c.json({
    decision: 'allow',
    risk: policyResult.risk,
    auditId: auditId ?? null,
  });
}

/**
 * POST /audit
 *
 * Reports the outcome of a tool execution.
 * If `auditId` is provided the existing record is updated;
 * otherwise a new audit log entry is created.
 */
export async function handleAudit(c: Context<{ Variables: GatewayVariables }>) {
  const body = await c.req.json<{
    auditId?: string;
    toolName?: string;
    providerId?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: unknown;
    durationMs?: number;
    agentId?: string;
  }>();

  const user = c.get('user');
  const agent = c.get('agent');

  const endUser = await resolveEndUserIdentity(
    user,
    c.req.header('X-Gateway-Session-Token'),
    c.req.header('X-End-User-Id'),
  );
  const endUserId = endUser.endUserId;
  const tenantId = endUser.endUserTenantId || user.tenantId;
  const agentId = body.agentId || agent?.id;
  const status = body.error ? 'failed' : 'completed';

  if (body.auditId) {
    await auditService.updateStatus(
      body.auditId,
      status,
      body.error || body.result,
      body.durationMs,
    );

    return c.json({ success: true, auditId: body.auditId });
  }

  // No auditId — create a fresh record
  if (!body.toolName) {
    return c.json({ error: 'Missing required field: toolName (required when auditId is not provided)' }, 400);
  }
  if (!body.providerId) {
    return c.json({ error: 'Missing required field: providerId (required when auditId is not provided)' }, 400);
  }

  const auditId = await auditService.log({
    userId: endUserId,
    tenantId,
    agentId,
    endUserId,
    providerId: body.providerId,
    toolName: body.toolName,
    arguments: body.params,
    result: body.error || body.result,
    status,
    duration: body.durationMs,
  });

  return c.json({ success: true, auditId });
}
