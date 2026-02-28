/**
 * Audit Log MCP Tools
 *
 * Exposes querying and statistics for audit logs
 * using internal auditService directly.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { auditService } from '../../services/audit.service/index.js';
import { ok, err } from './helpers.js';

export function registerAuditTools(server: McpServer) {
  // ---- get_audit_logs ----
  server.tool(
    'get_audit_logs',
    'Query audit logs for tool call history.',
    {
      limit: z
        .number()
        .int()
        .default(50)
        .describe('Maximum number of logs to return (default: 50)'),
      status: z
        .enum(['pending', 'confirmed', 'rejected', 'completed', 'failed'])
        .optional()
        .describe('Filter by status'),
      tool_name: z.string().optional().describe('Filter by tool name'),
      agent_id: z.string().optional().describe('Filter by agent ID'),
    },
    async ({ limit, status, tool_name, agent_id }): Promise<CallToolResult> => {
      try {
        const logs = await auditService.getLogs({
          limit,
          status,
          toolName: tool_name,
          // agent_id is passed as userId or agentId depending on your audit schema
          ...(agent_id ? { userId: agent_id } : {}),
        });
        return ok({ logs, count: logs.length });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- get_audit_stats ----
  server.tool(
    'get_audit_stats',
    'Get audit statistics and metrics. Returns aggregate statistics about tool usage, confirmation rates, and performance.',
    {},
    async (): Promise<CallToolResult> => {
      try {
        const recentLogs = await auditService.getLogs({ limit: 1000 });

        const stats = {
          total: recentLogs.length,
          byStatus: {
            pending: recentLogs.filter((l) => l.status === 'pending').length,
            completed: recentLogs.filter((l) => l.status === 'completed').length,
            failed: recentLogs.filter((l) => l.status === 'failed').length,
            confirmed: recentLogs.filter((l) => l.status === 'confirmed').length,
            rejected: recentLogs.filter((l) => l.status === 'rejected').length,
          },
          avgDuration:
            recentLogs.reduce((sum, l) => sum + (l.duration || 0), 0) /
              recentLogs.length || 0,
        };

        return ok({ stats });
      } catch (e) {
        return err(e);
      }
    },
  );
}
