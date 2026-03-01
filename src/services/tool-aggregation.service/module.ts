/**
 * Tool Aggregation Service
 *
 * Aggregates tool lists from multiple upstream MCP providers into a
 * single unified view. Used by the unified MCP endpoint to give agents
 * a merged, policy-filtered set of tools without needing to know about
 * individual providers.
 */

import type { ToolProvider } from '../../types/index.js';
import { toolProviderService } from '../tool-provider.service/index.js';
import { providerAccessService } from '../provider-access.service/index.js';
import { buildUpstreamHeaders } from '../mcp-proxy.service/index.js';
import { TTLCache } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AggregatedToolEntry {
  tool: McpTool;
  provider: ToolProvider;
}

interface PerProviderToolCache {
  tools: McpTool[];
  fetchedAt: number;
}

class ToolAggregationService {
  private providerToolCache = new TTLCache<PerProviderToolCache>(60_000);

  /**
   * Return a merged, deduplicated, policy-filtered list of tools
   * from all providers the caller is authorized to access.
   *
   * When `providerIds` is supplied, only those specific providers are
   * considered — all others are skipped before access evaluation.
   */
  /**
   * Return a merged, deduplicated, policy-filtered list of tools
   * from all providers the caller is authorized to access.
   *
   * @param endUserId  End-user ID (optional — when absent only agent rules apply)
   * @param agentId    Agent ID
   * @param providerIds  Restrict to specific provider IDs
   */
  async getAggregatedTools(
    endUserId: string | undefined,
    tenantId?: string,
    agentId?: string,
    agent?: { id: string; name: string } | null,
    providerIds?: string[]
  ): Promise<{ tools: McpTool[]; toolProviderMap: Map<string, ToolProvider> }> {
    let providers = await toolProviderService.getActiveProviders(tenantId);

    if (providerIds && providerIds.length > 0) {
      const idSet = new Set(providerIds);
      providers = providers.filter((p) => idSet.has(p.id));
      logger.info(
        `[ToolAggregation] Filtered to ${providers.length} provider(s) by explicit IDs [${providerIds.join(', ')}]`
      );
    }

    logger.info(
      `[ToolAggregation] Found ${providers.length} active providers for tenant=${tenantId || 'global'}, evaluating access for endUser=${endUserId || 'none'}, agent=${agentId || 'none'}`
    );

    const accessibleProviders: ToolProvider[] = [];
    for (const provider of providers) {
      const access = await providerAccessService.checkAccess(
        endUserId, provider.id, tenantId, agentId
      );
      if (access.allowed) {
        accessibleProviders.push(provider);
      } else {
        logger.debug(
          `[ToolAggregation] Skipping provider ${provider.name} (${provider.id}): ${access.reason}`
        );
      }
    }

    logger.info(
      `[ToolAggregation] ${accessibleProviders.length}/${providers.length} providers accessible`
    );

    const entries: AggregatedToolEntry[] = [];
    const userIdForUpstream = endUserId || agentId || '__agent__';
    const fetchPromises = accessibleProviders.map(async (provider) => {
      try {
        const tools = await this.fetchToolsFromProvider(provider, userIdForUpstream, tenantId, agent);
        return { provider, tools };
      } catch (err) {
        logger.warn(
          `[ToolAggregation] Failed to fetch tools from provider ${provider.name}: ${err instanceof Error ? err.message : err}`
        );
        return { provider, tools: [] as McpTool[] };
      }
    });

    const results = await Promise.all(fetchPromises);

    for (const { provider, tools } of results) {
      for (const tool of tools) {
        entries.push({ tool, provider });
      }
    }

    // Deduplicate by tool name — higher provider priority wins
    const toolMap = new Map<string, AggregatedToolEntry>();
    for (const entry of entries) {
      const existing = toolMap.get(entry.tool.name);
      if (!existing || entry.provider.priority > existing.provider.priority) {
        toolMap.set(entry.tool.name, entry);
      }
    }

    // Filter by tool-level policy (remove denied tools)
    const filteredTools: McpTool[] = [];
    const toolProviderMap = new Map<string, ToolProvider>();

    for (const [, entry] of toolMap) {
      const policy = await providerAccessService.evaluateToolPolicy(
        endUserId, entry.provider.id, entry.tool.name, tenantId, agentId
      );
      if (policy.action !== 'deny') {
        filteredTools.push(entry.tool);
        toolProviderMap.set(entry.tool.name, entry.provider);
      } else {
        logger.debug(
          `[ToolAggregation] Filtered out tool ${entry.tool.name} from ${entry.provider.name}: denied by policy`
        );
      }
    }

    logger.info(
      `[ToolAggregation] Returning ${filteredTools.length} tools (from ${toolMap.size} before policy filter)`
    );

    return { tools: filteredTools, toolProviderMap };
  }

  /**
   * Resolve which provider should handle a given tool name.
   *
   * When `providerIds` is supplied, only those providers are eligible.
   */
  async resolveToolProvider(
    toolName: string,
    tenantId?: string,
    providerIds?: string[]
  ): Promise<ToolProvider | null> {
    const result = await toolProviderService.resolveProvider(tenantId, toolName);
    if ('error' in result) {
      logger.debug(
        `[ToolAggregation] resolveToolProvider failed for ${toolName}: ${result.error.message}`
      );
      return null;
    }
    const provider = result.result.provider;
    if (providerIds && providerIds.length > 0 && !providerIds.includes(provider.id)) {
      logger.debug(
        `[ToolAggregation] Provider ${provider.name} (${provider.id}) resolved for tool ${toolName} but not in allowed list [${providerIds.join(', ')}]`
      );
      return null;
    }
    return provider;
  }

  /**
   * Public wrapper for admin use: fetch tool list from a single provider.
   * Uses a system-level identity (no real user/agent context needed).
   */
  async fetchToolsForProvider(provider: ToolProvider): Promise<McpTool[]> {
    return this.fetchToolsFromProvider(provider, '__admin__', undefined, null);
  }

  private async fetchToolsFromProvider(
    provider: ToolProvider,
    userId: string,
    tenantId?: string,
    agent?: { id: string; name: string } | null
  ): Promise<McpTool[]> {
    const cacheKey = `provider:${provider.id}`;
    const cached = this.providerToolCache.get(cacheKey);
    if (cached) {
      logger.debug(
        `[ToolAggregation] Cache HIT for provider ${provider.name}: ${cached.tools.length} tools`
      );
      return cached.tools;
    }

    const headers = buildUpstreamHeaders(
      { id: userId, tenantId },
      provider,
      agent
    );
    headers['Content-Type'] = 'application/json';
    headers['Accept'] = 'application/json, text/event-stream';

    const jsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };

    logger.debug(
      `[ToolAggregation] Fetching tools/list from provider ${provider.name} at ${provider.endpoint}`
    );

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(provider.endpoint);
    } catch {
      logger.debug(
        `[ToolAggregation] Provider "${provider.name}" has a non-URL endpoint, skipping tools/list`
      );
      return [];
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      logger.debug(
        `[ToolAggregation] Provider "${provider.name}" uses ${parsedUrl.protocol} scheme, skipping tools/list`
      );
      return [];
    }

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonRpcRequest),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${provider.endpoint}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    let responseBody: string;

    if (contentType.includes('text/event-stream')) {
      // SSE response — extract the first JSON-RPC message event
      responseBody = await this.extractSseJsonRpcMessage(response);
    } else {
      responseBody = await response.text();
    }

    const jsonResponse = JSON.parse(responseBody);
    const tools: McpTool[] = jsonResponse.result?.tools || [];

    this.providerToolCache.set(cacheKey, { tools, fetchedAt: Date.now() });

    logger.info(
      `[ToolAggregation] Fetched ${tools.length} tools from provider ${provider.name}`
    );

    return tools;
  }

  private async extractSseJsonRpcMessage(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Look for "event: message\ndata: {...}\n\n"
      const messageMatch = buffer.match(/event:\s*message\ndata:\s*(.+)\n/);
      if (messageMatch) {
        reader.cancel();
        return messageMatch[1];
      }
    }

    throw new Error('No JSON-RPC message found in SSE stream');
  }

  async getToolMetadata(
    providerId: string,
    toolName: string
  ): Promise<{ description?: string; inputSchema?: Record<string, unknown> } | null> {
    const cacheKey = `provider:${providerId}`;
    const cached = this.providerToolCache.get(cacheKey);
    if (!cached) return null;
    const tool = cached.tools.find(t => t.name === toolName);
    return tool ? { description: tool.description, inputSchema: tool.inputSchema } : null;
  }

  invalidateProviderCache(providerId?: string): void {
    if (providerId) {
      this.providerToolCache.invalidate(`provider:${providerId}`);
    } else {
      this.providerToolCache.invalidate();
    }
  }
}

export const toolAggregationService = new ToolAggregationService();
