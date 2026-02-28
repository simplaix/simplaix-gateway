/**
 * Agent Management MCP Tools
 *
 * Exposes CRUD + enable/disable operations for gateway agents
 * using internal agentService directly.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Agent } from '../../types/index.js';
import { agentService } from '../../services/agent.service/index.js';
import { ok, err } from './helpers.js';

function sanitizeAgent(agent: Agent) {
  const { upstreamSecret, ...rest } = agent;
  return { ...rest, hasUpstreamSecret: !!upstreamSecret };
}

export function registerAgentTools(server: McpServer) {
  // ---- list_agents ----
  server.tool(
    'list_agents',
    'List all registered agents in the gateway with their configurations including ID, name, description, upstream URL, status, and confirmation requirements.',
    {},
    async (): Promise<CallToolResult> => {
      try {
        const agents = await agentService.listAgents();
        return ok({ agents: agents.map(sanitizeAgent), count: agents.length });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- get_agent ----
  server.tool(
    'get_agent',
    'Get detailed information about a specific agent.',
    {
      agent_id: z.string().describe('The unique identifier of the agent'),
    },
    async ({ agent_id }): Promise<CallToolResult> => {
      try {
        const agent = await agentService.getAgent(agent_id);
        if (!agent) {
          return err('Agent not found');
        }
        return ok({ agent: sanitizeAgent(agent) });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- create_agent ----
  server.tool(
    'create_agent',
    'Create a new agent in the gateway.',
    {
      name: z.string().describe('Human-readable name for the agent (e.g., "Slack Bot", "GitHub Assistant")'),
      upstream_url: z.string().url().describe('The URL of the MCP server or runtime this agent connects to'),
      upstream_secret: z.string().optional().describe('Optional auth token sent as Authorization: Bearer header when the gateway calls the agent endpoint'),
      description: z.string().optional().describe('Optional description of what this agent does'),
      require_confirmation: z.boolean().default(false).describe('If true, tool calls from this agent require manual confirmation'),
    },
    async ({ name, upstream_url, upstream_secret, description, require_confirmation }): Promise<CallToolResult> => {
      try {
        const result = await agentService.createAgent({
          name,
          upstreamUrl: upstream_url,
          upstreamSecret: upstream_secret,
          description,
          requireConfirmation: require_confirmation,
        });
        const agents = await agentService.listAgents();
        return ok({
          agent: sanitizeAgent(result),
          runtime_token: result.runtimeToken,
          agents: agents.map(sanitizeAgent),
          message: `Agent '${name}' created successfully. IMPORTANT: Save the runtime_token — it is shown only once. The agent can use it to authenticate to the gateway MCP proxy.`,
        });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- update_agent ----
  server.tool(
    'update_agent',
    "Update an existing agent's configuration. Only provide the fields you want to update.",
    {
      agent_id: z.string().describe('The ID of the agent to update'),
      name: z.string().optional().describe('New name for the agent'),
      upstream_url: z.string().url().optional().describe('New upstream MCP server URL'),
      upstream_secret: z.string().nullable().optional().describe('Auth token for the agent endpoint (set null to clear)'),
      description: z.string().optional().describe('New description'),
      require_confirmation: z.boolean().optional().describe('New confirmation requirement setting'),
    },
    async ({ agent_id, name, upstream_url, upstream_secret, description, require_confirmation }): Promise<CallToolResult> => {
      try {
        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name;
        if (upstream_url !== undefined) updates.upstreamUrl = upstream_url;
        if (upstream_secret !== undefined) updates.upstreamSecret = upstream_secret;
        if (description !== undefined) updates.description = description;
        if (require_confirmation !== undefined) updates.requireConfirmation = require_confirmation;

        const agent = await agentService.updateAgent(agent_id, updates);
        if (!agent) {
          return err('Agent not found');
        }
        const agents = await agentService.listAgents();
        return ok({ agent: sanitizeAgent(agent), agents: agents.map(sanitizeAgent), message: 'Agent updated successfully' });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- delete_agent ----
  server.tool(
    'delete_agent',
    'Delete an agent from the gateway. WARNING: This action cannot be undone.',
    {
      agent_id: z.string().describe('The ID of the agent to delete'),
    },
    async ({ agent_id }): Promise<CallToolResult> => {
      try {
        const agent = await agentService.getAgent(agent_id);
        if (!agent) {
          return err('Agent not found');
        }
        await agentService.deleteAgent(agent_id);
        const agents = await agentService.listAgents();
        return ok({ message: 'Agent deleted successfully', agents: agents.map(sanitizeAgent) });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- toggle_agent ----
  server.tool(
    'toggle_agent',
    'Enable or disable an agent (kill switch). Disabled agents cannot make any tool calls through the gateway.',
    {
      agent_id: z.string().describe('The ID of the agent to toggle'),
      enabled: z.boolean().describe('True to enable, False to disable'),
    },
    async ({ agent_id, enabled }): Promise<CallToolResult> => {
      try {
        const agent = await agentService.getAgent(agent_id);
        if (!agent) {
          return err('Agent not found');
        }

        if (enabled) {
          await agentService.enableAgent(agent_id);
        } else {
          await agentService.disableAgent(agent_id);
        }

        const agents = await agentService.listAgents();
        return ok({
          message: `Agent ${enabled ? 'enabled' : 'disabled'} successfully`,
          agents: agents.map(sanitizeAgent),
        });
      } catch (e) {
        return err(e);
      }
    },
  );
}
