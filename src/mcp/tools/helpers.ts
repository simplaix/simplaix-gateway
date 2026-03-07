/**
 * Shared helper functions for MCP tool handlers
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function ok(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }],
  };
}

export function err(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }],
    isError: true,
  };
}
