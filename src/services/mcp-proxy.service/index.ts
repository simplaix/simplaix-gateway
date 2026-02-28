/**
 * MCP Proxy Service
 *
 * Shared logic for proxying MCP requests to upstream providers.
 * Used by both the per-provider endpoint (mcp-proxy.ts) and the
 * unified aggregation endpoint (mcp-unified.ts).
 */

import { toolProviderService } from '../tool-provider.service/index.js';
import { buildUpstreamHeaders, resolveEndUserIdentity } from './identity.js';
import { evaluateToolCallPolicy, CONFIRMATION_EXEMPT_TOOLS } from './policy.js';
import { forwardToUpstream } from './upstream.js';

export type {
  ProxyIdentity,
  PolicyDecision,
  EvaluateToolCallPolicyOptions,
} from './types.js';

export {
  buildUpstreamHeaders,
  resolveEndUserIdentity,
  evaluateToolCallPolicy,
  forwardToUpstream,
  CONFIRMATION_EXEMPT_TOOLS,
};

class McpProxyService {
  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      const providers = await toolProviderService.getActiveProviders();
      return { healthy: providers.length >= 0, latency: Date.now() - start };
    } catch {
      return { healthy: false, latency: Date.now() - start };
    }
  }
}

export const mcpProxyService = new McpProxyService();
