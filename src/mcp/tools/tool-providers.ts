/**
 * Tool Provider Management MCP Tools
 *
 * Exposes CRUD operations for tool providers (MCP server routing)
 * using internal toolProviderService directly.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toolProviderService } from '../../services/tool-provider.service/index.js';
import { ok, err } from './helpers.js';

export function registerToolProviderTools(server: McpServer) {
  // ---- list_tool_providers ----
  server.tool(
    'list_tool_providers',
    'List all configured tool providers (MCP servers). Tool providers route tool calls to specific MCP servers based on pattern matching.',
    {},
    async (): Promise<CallToolResult> => {
      try {
        const providers = await toolProviderService.listProviders();
        return ok({ providers, count: providers.length });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- create_tool_provider ----
  server.tool(
    'create_tool_provider',
    'Create a new tool provider to route tools to an MCP server.',
    {
      name: z.string().describe('Human-readable name (e.g., "Slack Integration", "GitHub Tools")'),
      pattern: z.string().describe('Glob pattern to match tool names (e.g., "slack_*", "github_*", "*")'),
      endpoint: z.string().url().describe('URL of the MCP server to route matching tools to'),
      auth_type: z
        .enum(['none', 'bearer', 'api_key'])
        .default('none')
        .describe('Authentication type'),
      auth_secret: z
        .string()
        .optional()
        .describe('Secret/token for authentication (required if auth_type is not "none")'),
      description: z.string().optional().describe('Optional description of this provider'),
      priority: z
        .number()
        .int()
        .default(0)
        .describe('Higher priority providers match first (default: 0)'),
    },
    async ({ name, pattern, endpoint, auth_type, auth_secret, description, priority }): Promise<CallToolResult> => {
      try {
        const provider = await toolProviderService.createProvider({
          name,
          pattern,
          endpoint,
          authType: auth_type,
          authSecret: auth_secret,
          description,
          priority,
        });
        return ok({ provider, message: `Tool provider '${name}' created successfully` });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- update_tool_provider ----
  server.tool(
    'update_tool_provider',
    "Update an existing tool provider's configuration. Only provide the fields you want to update.",
    {
      provider_id: z.string().describe('The ID of the provider to update'),
      name: z.string().optional().describe('New name'),
      pattern: z.string().optional().describe('New pattern'),
      endpoint: z.string().url().optional().describe('New endpoint URL'),
      auth_type: z.enum(['none', 'bearer', 'api_key']).optional().describe('New auth type'),
      auth_secret: z.string().optional().describe('New auth secret'),
      description: z.string().optional().describe('New description'),
      priority: z.number().int().optional().describe('New priority'),
      is_active: z.boolean().optional().describe('Enable/disable the provider'),
    },
    async ({
      provider_id,
      name,
      pattern,
      endpoint,
      auth_type,
      auth_secret,
      description,
      priority,
      is_active,
    }): Promise<CallToolResult> => {
      try {
        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name;
        if (pattern !== undefined) updates.pattern = pattern;
        if (endpoint !== undefined) updates.endpoint = endpoint;
        if (auth_type !== undefined) updates.authType = auth_type;
        if (auth_secret !== undefined) updates.authSecret = auth_secret;
        if (description !== undefined) updates.description = description;
        if (priority !== undefined) updates.priority = priority;
        if (is_active !== undefined) updates.isActive = is_active;

        const provider = await toolProviderService.updateProvider(provider_id, updates);
        if (!provider) {
          return err('Tool provider not found');
        }
        return ok({ provider, message: 'Tool provider updated successfully' });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- delete_tool_provider ----
  server.tool(
    'delete_tool_provider',
    "Delete a tool provider. Tools matching this provider's pattern will fall back to other providers or fail.",
    {
      provider_id: z.string().describe('The ID of the provider to delete'),
    },
    async ({ provider_id }): Promise<CallToolResult> => {
      try {
        const provider = await toolProviderService.getProvider(provider_id);
        if (!provider) {
          return err('Tool provider not found');
        }
        await toolProviderService.deleteProvider(provider_id);
        return ok({ message: 'Tool provider deleted successfully' });
      } catch (e) {
        return err(e);
      }
    },
  );
}
