/**
 * Gateway MCP Server Route
 *
 * Serves an MCP (Model Context Protocol) endpoint at /mcp that exposes
 * gateway management tools: agents, tool providers, confirmations, and audit.
 *
 * Uses @hono/mcp StreamableHTTPTransport for the MCP protocol layer
 * and calls internal gateway services directly (no HTTP round-trip).
 */

import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';

import type { GatewayVariables } from '../types/index.js';
import { registerAgentTools } from './tools/agents.js';
import { registerToolProviderTools } from './tools/tool-providers.js';
import { registerConfirmationTools } from './tools/confirmations.js';
import { registerAuditTools } from './tools/audit.js';
import { registerPolicyTools } from './tools/policies.js';

/**
 * Create and configure the MCP server with all gateway tools.
 */
function createMcpServer(): McpServer {
  const mcpServer = new McpServer({
    name: 'simplaix-gateway',
    version: '0.1.0',
  });

  registerAgentTools(mcpServer);
  registerToolProviderTools(mcpServer);
  registerConfirmationTools(mcpServer);
  registerAuditTools(mcpServer);
  registerPolicyTools(mcpServer);

  return mcpServer;
}

/**
 * Hono route that serves the MCP endpoint.
 *
 * Mount this in the main app:
 *   app.route('/v1/mcp-server', mcpServerRoutes);
 *
 * The MCP endpoint will be available at:
 *   POST /api/v1/mcp-server/mcp   (tools/list, tools/call, etc.)
 */
const mcpServerRoutes = new Hono<{ Variables: GatewayVariables }>();

const mcpServer = createMcpServer();
const transport = new StreamableHTTPTransport();

mcpServerRoutes.all('/mcp', async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  return transport.handleRequest(c);
});

// Health check for the MCP server
mcpServerRoutes.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    server: 'simplaix-gateway-mcp',
    version: '0.1.0',
    connected: mcpServer.isConnected(),
    tools: [
      'list_agents',
      'get_agent',
      'create_agent',
      'update_agent',
      'delete_agent',
      'toggle_agent',
      'list_tool_providers',
      'create_tool_provider',
      'update_tool_provider',
      'delete_tool_provider',
      'list_pending_confirmations',
      'confirm_request',
      'reject_request',
      'get_audit_logs',
      'get_audit_stats',
      'list_access_policies',
      'create_access_policy',
      'evaluate_tool_policy',
      'get_access_policy',
      'update_access_policy',
      'delete_access_policy',
    ],
  });
});

export { mcpServerRoutes };
