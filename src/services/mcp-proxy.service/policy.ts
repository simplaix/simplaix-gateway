import type { Context } from 'hono';
import type { SSEStreamingApi } from 'hono/streaming';
import { streamSSE } from 'hono/streaming';
import type { GatewayVariables } from '../../types/index.js';
import { providerAccessService } from '../provider-access.service/index.js';
import { auditService } from '../audit.service/index.js';
import { requestPauser } from '../pauser.service/index.js';
import { prepareConfirmation } from '../confirmation-flow.service/index.js';
import { logger } from '../../utils/logger.js';
import type { EvaluateToolCallPolicyOptions, PolicyDecision } from './types.js';

export const CONFIRMATION_EXEMPT_TOOLS = new Set([
  'confirm_request',
  'reject_request',
  'list_pending_confirmations',
]);

export async function evaluateToolCallPolicy(opts: EvaluateToolCallPolicyOptions): Promise<PolicyDecision> {
  const { identity, provider, toolName, toolArgs, jsonRpcId } = opts;
  const { user, agent, endUserId, endUserTenantId } = identity;

  if (CONFIRMATION_EXEMPT_TOOLS.has(toolName)) {
    logger.debug(`[MCPProxy] Tool ${toolName} is exempt from confirmation policy, allowing through`);
    const auditPromise = auditService.log({
      userId: endUserId,
      tenantId: endUserTenantId,
      agentId: agent?.id,
      endUserId,
      providerId: provider.id,
      toolName,
      arguments: toolArgs,
      status: 'pending',
    }).catch((err) => {
      logger.warn('[MCPProxy] Audit log create failed:', err);
      return undefined;
    });
    return { type: 'exempt', auditPromise };
  }

  const policyResult = await providerAccessService.evaluateToolPolicy(
    endUserId,
    provider.id,
    toolName,
    endUserTenantId,
    agent?.id
  );

  logger.info(
    `[MCPProxy] Policy decision: tool=${toolName}, action=${policyResult.action}, risk=${policyResult.risk}, endUser=${endUserId}, agent=${agent?.id || 'none'}, provider=${provider.id}${policyResult.matchedRule ? `, ruleId=${policyResult.matchedRule.id}` : ', source=config-fallback'}`
  );

  if (policyResult.action === 'deny') {
    auditService.log({
      userId: endUserId,
      tenantId: endUserTenantId,
      agentId: agent?.id,
      endUserId,
      providerId: provider.id,
      toolName,
      arguments: toolArgs,
      status: 'failed',
    }).catch(() => {});

    return {
      type: 'deny',
      jsonRpcResponse: {
        jsonrpc: '2.0',
        id: jsonRpcId,
        error: {
          code: -32600,
          message: `Tool '${toolName}' is denied by policy`,
        },
      },
    };
  }

  if (policyResult.action === 'require_confirmation') {
    logger.info(
      `[MCPProxy] Tool ${toolName} requires confirmation — sync hold (user=${user.id}, agent=${agent?.id || 'none'})`
    );

    const setup = await prepareConfirmation({
      userId: user.id,
      tenantId: endUserTenantId,
      endUserId,
      toolName,
      arguments: toolArgs,
      risk: policyResult.risk,
      providerId: provider.id,
      agentId: agent?.id,
      agentName: agent?.name,
      ruleId: policyResult.matchedRule?.id,
    });

    const { confirmationRequestId, pendingAuditId, pauseParams } = setup;

    const sseHandler = (c: Context<{ Variables: GatewayVariables }>) =>
      streamSSE(c, async (stream: SSEStreamingApi) => {
        const heartbeat = setInterval(async () => {
          try {
            await stream.write(': heartbeat\n\n');
          } catch {
            clearInterval(heartbeat);
          }
        }, 15000);

        try {
          const confirmationResult = await requestPauser.pause(pauseParams);

          if (!confirmationResult.confirmed) {
            logger.info(
              `[MCPProxy] Confirmation ${confirmationRequestId} rejected for ${toolName} (user=${user.id}): ${confirmationResult.reason || 'no reason'}`
            );
            if (pendingAuditId) {
              auditService.updateStatus(
                pendingAuditId, 'failed',
                { rejected: true, reason: confirmationResult.reason },
                Date.now() - opts.startTime
              ).catch(() => {});
            }
            await stream.writeSSE({
              event: 'message',
              data: JSON.stringify({
                jsonrpc: '2.0',
                id: jsonRpcId,
                result: {
                  content: [{
                    type: 'text',
                    text: `Tool "${toolName}" was rejected${confirmationResult.reason ? `: ${confirmationResult.reason}` : '.'}`,
                  }],
                },
              }),
            });
            return;
          }

          logger.info(
            `[MCPProxy] Confirmation ${confirmationRequestId} granted for ${toolName} (user=${user.id}), forwarding to upstream`
          );

          try {
            const upstreamResponse = await fetch(opts.upstreamUrl, {
              method: 'POST',
              headers: opts.forwardHeaders,
              body: opts.body,
            });

            const upstreamContentType = upstreamResponse.headers.get('Content-Type') || '';

            if (upstreamContentType.includes('text/event-stream')) {
              if (pendingAuditId) {
                auditService.updateStatus(
                  pendingAuditId, 'completed', undefined, Date.now() - opts.startTime
                ).catch(() => {});
              }
              const reader = upstreamResponse.body?.getReader();
              if (reader) {
                const decoder = new TextDecoder();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  await stream.write(decoder.decode(value, { stream: true }));
                }
              }
            } else {
              const responseBody = await upstreamResponse.text();
              if (pendingAuditId) {
                const duration = Date.now() - opts.startTime;
                let auditStatus: 'completed' | 'failed' = upstreamResponse.ok ? 'completed' : 'failed';
                let auditResult: unknown;
                try {
                  const jsonResult = JSON.parse(responseBody);
                  if (jsonResult.error) {
                    auditStatus = 'failed';
                    auditResult = jsonResult.error;
                  } else {
                    auditResult = jsonResult.result;
                  }
                } catch {
                  // not JSON
                }
                auditService.updateStatus(
                  pendingAuditId, auditStatus, auditResult, duration
                ).catch(() => {});
              }

              await stream.writeSSE({
                event: 'message',
                data: responseBody,
              });
            }
          } catch (upstreamError) {
            logger.error(
              `[MCPProxy] Upstream request failed after confirmation for ${toolName}:`,
              upstreamError
            );
            if (pendingAuditId) {
              auditService.updateStatus(
                pendingAuditId, 'failed',
                { error: String(upstreamError) },
                Date.now() - opts.startTime
              ).catch(() => {});
            }
            await stream.writeSSE({
              event: 'message',
              data: JSON.stringify({
                jsonrpc: '2.0',
                id: jsonRpcId,
                error: {
                  code: -32603,
                  message: `Upstream MCP server error: ${upstreamError instanceof Error ? upstreamError.message : 'Unknown error'}`,
                },
              }),
            });
          }
        } finally {
          clearInterval(heartbeat);
        }
      });

    return { type: 'require_confirmation', sseHandler };
  }

  const auditPromise = auditService.log({
    userId: endUserId,
    tenantId: endUserTenantId,
    agentId: agent?.id,
    endUserId,
    providerId: provider.id,
    toolName,
    arguments: toolArgs,
    status: 'pending',
  }).catch((err) => {
    logger.warn('[MCPProxy] Audit log create failed:', err);
    return undefined;
  });

  return { type: 'allow', auditPromise };
}
