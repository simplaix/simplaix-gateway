/**
 * Confirmation Management MCP Tools
 *
 * Exposes list/confirm/reject operations for pending tool-call confirmations
 * using internal requestPauser directly.
 *
 * Note: The pauser's resolve() callback already updates the audit record,
 * so we don't need to call auditService separately here.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requestPauser } from '../../services/pauser.service/index.js';
import { ok, err } from './helpers.js';

export function registerConfirmationTools(server: McpServer) {
  // ---- list_pending_confirmations ----
  server.tool(
    'list_pending_confirmations',
    'List all pending confirmation requests. These are tool calls from agents that require manual confirmation before execution.',
    {},
    async (): Promise<CallToolResult> => {
      try {
        const pending = requestPauser.getAllPending();
        const confirmations = pending.map((req) => ({
          id: req.id,
          userId: req.userId,
          tenantId: req.tenantId,
          toolName: req.toolName,
          arguments: req.arguments,
          risk: req.risk,
          createdAt: req.createdAt.toISOString(),
        }));
        return ok({ confirmations, count: confirmations.length });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- confirm_request ----
  server.tool(
    'confirm_request',
    'Confirm a pending tool call request. Once confirmed, the tool call will be executed immediately.',
    {
      confirmation_id: z.string().describe('The ID of the confirmation request'),
      reason: z.string().optional().describe('Optional reason for confirmation (for audit trail)'),
    },
    async ({ confirmation_id, reason }): Promise<CallToolResult> => {
      try {
        const resumed = requestPauser.resume(confirmation_id, {
          confirmed: true,
          reason,
        });

        if (!resumed) {
          return err('Confirmation request not found or already resolved');
        }

        return ok({ message: 'Request confirmed' });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- reject_request ----
  server.tool(
    'reject_request',
    'Reject a pending tool call request. The tool call will not be executed and the requesting agent will receive an error.',
    {
      confirmation_id: z.string().describe('The ID of the confirmation request'),
      reason: z.string().optional().describe('Optional reason for rejection (for audit trail)'),
    },
    async ({ confirmation_id, reason }): Promise<CallToolResult> => {
      try {
        const resumed = requestPauser.resume(confirmation_id, {
          confirmed: false,
          reason,
        });

        if (!resumed) {
          return err('Confirmation request not found or already resolved');
        }

        return ok({ message: 'Request rejected' });
      } catch (e) {
        return err(e);
      }
    },
  );
}
