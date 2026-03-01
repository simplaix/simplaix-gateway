/**
 * Policy Management MCP Tools
 *
 * Exposes CRUD + evaluation operations for provider access rules (policies)
 * using internal providerAccessService directly.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CreateProviderAccessRuleInput } from '../../types/index.js';
import { providerAccessService } from '../../services/provider-access.service/index.js';
import { ok, err } from './helpers.js';

export function registerPolicyTools(server: McpServer) {
  // ---- list_access_policies ----
  server.tool(
    'list_access_policies',
    'List all access policy rules. Optionally filter by provider, subject type, subject ID, action, or tool pattern.',
    {
      providerId: z.string().optional().describe('Filter by provider ID'),
      subjectType: z.enum(['user', 'agent']).optional().describe('Filter by subject type'),
      subjectId: z.string().optional().describe('Filter by subject ID or agent ID'),
      action: z.enum(['allow', 'deny', 'require_confirmation']).optional().describe('Filter by action'),
      toolPattern: z.string().optional().describe('Filter by tool pattern'),
    },
    async (filters): Promise<CallToolResult> => {
      try {
        const rules = await providerAccessService.listRules(
          Object.fromEntries(
            // Strip undefined filters so service receives only active constraints.
            Object.entries(filters).filter(([, v]) => v !== undefined)
          )
        );
        return ok({ rules, count: rules.length });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- create_access_policy ----
  server.tool(
    'create_access_policy',
    'Create a new access policy rule that controls who can access which tool providers and tools.',
    {
      subjectType: z.enum(['user', 'agent']).describe('Subject type: user or agent'),
      subjectId: z.string().describe('Subject ID — a user ID or agent ID'),
      providerId: z.string().describe('Tool provider ID, or "*" for all providers'),
      action: z.enum(['allow', 'deny', 'require_confirmation']).describe('Access action: allow, deny, or require_confirmation'),
      toolPattern: z.string().optional().describe('Glob pattern for tool names (e.g., "slack_send_*"). Defaults to "*" (all tools)'),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Risk level for this policy'),
      description: z.string().optional().describe('Human-readable description of this policy'),
    },
    async ({ subjectType, subjectId, providerId, action, toolPattern, riskLevel, description }): Promise<CallToolResult> => {
      try {
        const rule = await providerAccessService.createRule({
          subjectType,
          subjectId,
          providerId,
          action,
          toolPattern,
          riskLevel,
          description,
        });
        const rules = await providerAccessService.listRules();
        return ok({
          rule,
          rules,
          message: `Access policy created: ${subjectType}:${subjectId} → ${action} on provider "${providerId}" (tools: ${toolPattern || '*'})`,
        });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- evaluate_tool_policy ----
  server.tool(
    'evaluate_tool_policy',
    'Evaluate the effective policy for a specific user + provider + tool combination. Shows what action would be taken and which rule matched.',
    {
      userId: z.string().describe('User ID to evaluate the policy for'),
      providerId: z.string().describe('Tool provider ID'),
      toolName: z.string().describe('Tool name to evaluate'),
      tenantId: z.string().optional().describe('Optional tenant ID for multi-tenant evaluation'),
      agentId: z.string().optional().describe('Optional agent ID for agent-level evaluation'),
    },
    async ({ userId, providerId, toolName, tenantId, agentId }): Promise<CallToolResult> => {
      try {
        const result = await providerAccessService.evaluateToolPolicy(
          userId,
          providerId,
          toolName,
          tenantId,
          agentId
        );
        return ok({
          action: result.action,
          risk: result.risk,
          matchedRule: result.matchedRule || null,
        });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- get_access_policy ----
  server.tool(
    'get_access_policy',
    'Get a specific access policy rule by its ID.',
    {
      id: z.string().describe('The unique identifier of the access policy rule'),
    },
    async ({ id }): Promise<CallToolResult> => {
      try {
        const rule = await providerAccessService.getRule(id);
        if (!rule) {
          return err('Access policy rule not found');
        }
        return ok({ rule });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- update_access_policy ----
  server.tool(
    'update_access_policy',
    'Update an existing access policy rule. Only provide the fields you want to change.',
    {
      id: z.string().describe('The ID of the policy rule to update'),
      subjectType: z.enum(['user', 'agent']).optional().describe('New subject type'),
      subjectId: z.string().optional().describe('New subject ID'),
      providerId: z.string().optional().describe('New provider ID'),
      action: z.enum(['allow', 'deny', 'require_confirmation']).optional().describe('New access action'),
      toolPattern: z.string().optional().describe('New tool pattern'),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('New risk level'),
      description: z.string().optional().describe('New description'),
    },
    async ({ id, ...updates }): Promise<CallToolResult> => {
      try {
        const filtered = Object.fromEntries(
          // Preserve partial-update semantics for MCP tool callers.
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );
        const rule = await providerAccessService.updateRule(
          id,
          filtered as Partial<Omit<CreateProviderAccessRuleInput, 'tenantId'>>
        );
        if (!rule) {
          return err('Access policy rule not found');
        }
        const rules = await providerAccessService.listRules();
        return ok({ rule, rules, message: 'Access policy updated successfully' });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- delete_access_policy ----
  server.tool(
    'delete_access_policy',
    'Delete an access policy rule by its ID. WARNING: This action cannot be undone.',
    {
      id: z.string().describe('The ID of the policy rule to delete'),
    },
    async ({ id }): Promise<CallToolResult> => {
      try {
        const rule = await providerAccessService.getRule(id);
        if (!rule) {
          return err('Access policy rule not found');
        }
        await providerAccessService.deleteRule(id);
        const rules = await providerAccessService.listRules();
        return ok({ message: 'Access policy deleted successfully', rules });
      } catch (e) {
        return err(e);
      }
    },
  );
}
