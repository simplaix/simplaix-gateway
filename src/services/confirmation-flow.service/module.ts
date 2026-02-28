/**
 * Shared Confirmation Flow
 *
 * Centralised setup for confirmation requests used by both the MCP proxy
 * and tool-gate evaluate endpoint.  Guarantees every confirmation goes
 * through the same path: DB record → audit log → tool metadata resolution
 * → requestPauser.pause() → push notification (via event emitter).
 */

import { nanoid } from 'nanoid';
import type { RiskLevel, ConfirmationResult } from '../../types/index.js';
import { auditService } from '../audit.service/index.js';
import { requestPauser } from '../pauser.service/index.js';
import { toolAggregationService } from '../tool-aggregation.service/index.js';
import { toolProviderService } from '../tool-provider.service/index.js';
import { logger } from '../../utils/logger.js';

export interface ConfirmationFlowParams {
  /** Authenticated caller's user ID (may be agent runtime) */
  userId: string;
  tenantId?: string;
  /** Resolved end-user who should receive the notification */
  endUserId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  risk: RiskLevel;
  providerId: string;
  agentId?: string;
  agentName?: string;
  ruleId?: string;
}

export interface ConfirmationSetup {
  confirmationRequestId: string;
  pendingAuditId?: string;
  pauseParams: Parameters<typeof requestPauser.pause>[0];
}

/**
 * Phase 1 — prepare all DB records and resolve metadata.
 *
 * Returns everything needed to call `requestPauser.pause()`.
 * Callers that need custom blocking behaviour (e.g. MCP SSE handler)
 * can call this, then invoke `requestPauser.pause(setup.pauseParams)`
 * inside their own stream context.
 */
export async function prepareConfirmation(
  params: ConfirmationFlowParams,
): Promise<ConfirmationSetup> {
  const confirmationRequestId = nanoid();

  logger.info(
    `[ConfirmationFlow] Preparing confirmation: tool=${params.toolName}, confirmationId=${confirmationRequestId}, ` +
      `endUser=${params.endUserId}, agent=${params.agentId || 'none'}, provider=${params.providerId}`,
  );

  await auditService.recordConfirmation({
    requestId: confirmationRequestId,
    userId: params.endUserId,
    tenantId: params.tenantId,
    toolName: params.toolName,
    arguments: params.arguments,
    risk: params.risk,
    providerId: params.providerId,
    agentId: params.agentId,
    endUserId: params.endUserId,
    ruleId: params.ruleId,
  });

  const pendingAuditId = await auditService
    .log({
      userId: params.endUserId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      endUserId: params.endUserId,
      providerId: params.providerId,
      toolName: params.toolName,
      arguments: params.arguments,
      confirmationId: confirmationRequestId,
      status: 'pending',
    })
    .catch((err) => {
      logger.warn('[ConfirmationFlow] Audit log create failed:', err);
      return undefined;
    });

  const toolMeta = await toolAggregationService
    .getToolMetadata(params.providerId, params.toolName)
    .catch(() => null);

  const provider = await toolProviderService
    .getProvider(params.providerId)
    .catch(() => null);

  const pauseParams: Parameters<typeof requestPauser.pause>[0] = {
    userId: params.userId,
    tenantId: params.tenantId,
    toolName: params.toolName,
    arguments: params.arguments || {},
    risk: params.risk,
    providerId: params.providerId,
    agentId: params.agentId,
    endUserId: params.endUserId,
    confirmationRequestId,
    toolDescription: toolMeta?.description,
    toolInputSchema: toolMeta?.inputSchema,
    providerName: provider?.name,
    agentName: params.agentName,
  };

  return { confirmationRequestId, pendingAuditId, pauseParams };
}

/**
 * Phase 1+2 — prepare *and* block until the confirmation is resolved.
 *
 * Convenience wrapper for synchronous flows (tool-gate) that hold the
 * HTTP connection while waiting for approval.
 */
export async function executeConfirmationFlow(
  params: ConfirmationFlowParams,
): Promise<{
  confirmationRequestId: string;
  pendingAuditId?: string;
  result: ConfirmationResult;
}> {
  const setup = await prepareConfirmation(params);
  const result = await requestPauser.pause(setup.pauseParams);
  return {
    confirmationRequestId: setup.confirmationRequestId,
    pendingAuditId: setup.pendingAuditId,
    result,
  };
}
