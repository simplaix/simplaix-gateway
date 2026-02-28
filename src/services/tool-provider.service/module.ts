/**
 * Tool Provider Service
 * Resolves tool names to provider endpoints using glob pattern matching
 */

import { nanoid } from 'nanoid';
import { eq, desc } from 'drizzle-orm';
import { getDatabase } from '../../db/index.js';
import { toolProviders } from '../../db/schema.js';
import { TTLCache } from '../../utils/cache.js';
import { matchGlobPattern } from '../../utils/glob.js';
import type { ToolProvider } from '../../types/index.js';

export type { ToolProvider };

export interface ResolveResult {
  provider: ToolProvider;
  matchedPattern: string;
}

export interface ResolveError {
  code: 'NOT_FOUND' | 'AMBIGUOUS';
  message: string;
  providers?: ToolProvider[];
}

/**
 * Tool Provider Service
 */
class ToolProviderService {
  private providerCache = new TTLCache<ToolProvider | null>(60_000); // 60s TTL

  /**
   * Resolve a provider for a tool by name and tenant
   */
  async resolveProvider(
    tenantId: string | undefined,
    toolName: string
  ): Promise<{ result: ResolveResult } | { error: ResolveError }> {
    const providers = await this.getActiveProviders(tenantId);

    const matches: { provider: ToolProvider; matchedPattern: string }[] = [];

    for (const provider of providers) {
      if (matchGlobPattern(toolName, provider.pattern)) {
        matches.push({ provider, matchedPattern: provider.pattern });
      }
    }

    if (matches.length === 0) {
      return {
        error: {
          code: 'NOT_FOUND',
          message: `No provider configured for tool '${toolName}'`,
        },
      };
    }

    matches.sort((a, b) => {
      // Higher priority wins first; specificity breaks ties.
      if (a.provider.priority !== b.provider.priority) {
        return b.provider.priority - a.provider.priority;
      }
      const aSpecificity = this.getPatternSpecificity(a.matchedPattern);
      const bSpecificity = this.getPatternSpecificity(b.matchedPattern);
      return bSpecificity - aSpecificity;
    });

    if (matches.length > 1) {
      const topMatch = matches[0];
      const secondMatch = matches[1];

      const topSpecificity = this.getPatternSpecificity(topMatch.matchedPattern);
      const secondSpecificity = this.getPatternSpecificity(secondMatch.matchedPattern);

      if (
        topMatch.provider.priority === secondMatch.provider.priority &&
        topSpecificity === secondSpecificity
      ) {
        // Surface ambiguity explicitly instead of making nondeterministic routing choices.
        return {
          error: {
            code: 'AMBIGUOUS',
            message: `Multiple providers match tool '${toolName}' with same priority`,
            providers: matches.map((m) => m.provider),
          },
        };
      }
    }

    return { result: matches[0] };
  }

  private getPatternSpecificity(pattern: string): number {
    const nonWildcardLength = pattern.replace(/[*?]/g, '').length;
    const wildcardCount = (pattern.match(/[*?]/g) || []).length;
    return nonWildcardLength * 10 - wildcardCount;
  }

  /**
   * Get all active providers for a tenant (including global)
   */
  async getActiveProviders(tenantId?: string): Promise<ToolProvider[]> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(toolProviders)
      .where(eq(toolProviders.isActive, true))
      .orderBy(desc(toolProviders.priority));

    return results
      .filter((row) => row.tenantId === null || row.tenantId === tenantId)
      .map((row) => this.normalizeProvider(row));
  }

  /**
   * Create a new provider
   */
  async createProvider(data: {
    tenantId?: string;
    name: string;
    pattern: string;
    endpoint: string;
    authType?: 'bearer' | 'api_key' | 'none';
    authSecret?: string;
    priority?: number;
    description?: string;
  }): Promise<ToolProvider> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();

    await db.insert(toolProviders).values({
      id,
      tenantId: data.tenantId || null,
      name: data.name,
      pattern: data.pattern,
      endpoint: data.endpoint,
      authType: data.authType || 'none',
      authSecret: data.authSecret || null,
      isActive: true,
      priority: data.priority || 0,
      description: data.description || null,
      createdAt: now,
    });

    return {
      id,
      tenantId: data.tenantId,
      name: data.name,
      pattern: data.pattern,
      endpoint: data.endpoint,
      authType: data.authType || 'none',
      authSecret: data.authSecret,
      isActive: true,
      priority: data.priority || 0,
      description: data.description,
      createdAt: now,
    };
  }

  /**
   * Get provider by ID
   */
  async getProvider(id: string): Promise<ToolProvider | null> {
    const cached = this.providerCache.get(id);
    if (cached !== undefined) return cached;

    const db = getDatabase();

    const results = await db
      .select()
      .from(toolProviders)
      .where(eq(toolProviders.id, id))
      .limit(1);

    const provider = results.length === 0 ? null : this.normalizeProvider(results[0]);
    this.providerCache.set(id, provider);
    return provider;
  }

  /**
   * List providers for a tenant
   */
  async listProviders(tenantId?: string): Promise<ToolProvider[]> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(toolProviders)
      .orderBy(desc(toolProviders.priority));

    return results
      .filter((row) => !tenantId || row.tenantId === null || row.tenantId === tenantId)
      .map((row) => this.normalizeProvider(row));
  }

  /**
   * Update provider
   */
  async updateProvider(
    id: string,
    data: Partial<{
      name: string;
      pattern: string;
      endpoint: string;
      authType: 'bearer' | 'api_key' | 'none';
      authSecret: string | null;
      isActive: boolean;
      priority: number;
      description: string | null;
    }>
  ): Promise<ToolProvider | null> {
    const db = getDatabase();

    await db
      .update(toolProviders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(toolProviders.id, id));

    this.providerCache.invalidate(id);
    return this.getProvider(id);
  }

  /**
   * Delete provider
   */
  async deleteProvider(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(toolProviders).where(eq(toolProviders.id, id));
    this.providerCache.invalidate(id);
  }

  private normalizeProvider(row: Record<string, unknown>): ToolProvider {
    return {
      id: String(row.id),
      tenantId: (row.tenantId || row.tenant_id || undefined) as string | undefined,
      name: String(row.name),
      pattern: String(row.pattern),
      endpoint: String(row.endpoint),
      authType: (row.authType || row.auth_type || 'none') as ToolProvider['authType'],
      authSecret: (row.authSecret || row.auth_secret || undefined) as string | undefined,
      isActive: Boolean(row.isActive ?? row.is_active),
      priority: Number(row.priority || 0),
      description: (row.description || undefined) as string | undefined,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt
          : new Date((row.createdAt || row.created_at) as string | number | Date),
      updatedAt: row.updatedAt || row.updated_at
        ? row.updatedAt instanceof Date
          ? row.updatedAt
          : new Date((row.updatedAt || row.updated_at) as string | number | Date)
        : undefined,
    };
  }
}

// Export singleton instance
export const toolProviderService = new ToolProviderService();
