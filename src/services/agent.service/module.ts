/**
 * Agent Service
 * Manages Virtual Agent identities
 */

import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '../../db/index.js';
import { agents } from '../../db/schema.js';
import type {
  Agent,
  AgentWithRuntimeToken,
  CreateAgentInput,
  UpdateAgentInput,
} from '../../types/index.js';
import { TTLCache } from '../../utils/cache.js';

/**
 * Agent Service class
 */
class AgentService {
  private tokenCache = new TTLCache<Agent | null>(60_000); // 60s TTL
  // ==================== Agent CRUD ====================

  /**
   * Create a new agent with auto-generated UUID and runtime token (art_xxx)
   */
  async createAgent(data: CreateAgentInput): Promise<AgentWithRuntimeToken> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();

    const plainToken = this.generateToken();
    const tokenHash = this.hashToken(plainToken);
    const tokenPrefix = plainToken.slice(0, 8);

    const requiredCredentialsJson = data.requiredCredentials
      ? JSON.stringify(data.requiredCredentials)
      : null;

    await db.insert(agents).values({
      id,
      name: data.name,
      upstreamUrl: data.upstreamUrl,
      upstreamSecret: data.upstreamSecret || null,
      runtimeTokenHash: tokenHash,
      runtimeTokenPrefix: tokenPrefix,
      isActive: true,
      requireConfirmation: data.requireConfirmation || false,
      requiredCredentials: requiredCredentialsJson,
      tenantId: data.tenantId || null,
      ownerUserId: data.ownerUserId || null,
      description: data.description || null,
      createdAt: now,
      updatedAt: null,
    });

    console.log(`[AgentService] Created agent: ${id} (${data.name}) with runtime token ${tokenPrefix}...`);

    const agent: Agent = {
      id,
      name: data.name,
      upstreamUrl: data.upstreamUrl,
      upstreamSecret: data.upstreamSecret || null,
      runtimeTokenHash: tokenHash,
      runtimeTokenPrefix: tokenPrefix,
      isActive: true,
      requireConfirmation: data.requireConfirmation || false,
      requiredCredentials: requiredCredentialsJson,
      tenantId: data.tenantId || null,
      ownerUserId: data.ownerUserId || null,
      description: data.description || null,
      createdAt: now,
      updatedAt: null,
    } as Agent;

    return {
      ...agent,
      runtimeToken: plainToken,
    };
  }

  /**
   * Get an agent by ID
   */
  async getAgent(id: string): Promise<Agent | null> {
    const db = getDatabase();

    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    if (result.length === 0) return null;

    return this.normalizeAgent(result[0]);
  }

  /**
   * Get an agent by ID with tenant isolation check
   */
  async getAgentForTenant(id: string, tenantId?: string): Promise<Agent | null> {
    const agent = await this.getAgent(id);

    if (!agent) return null;

    if (agent.tenantId && tenantId && agent.tenantId !== tenantId) {
      console.log(`[AgentService] Tenant mismatch: agent ${id} belongs to tenant ${agent.tenantId}, not ${tenantId}`);
      return null;
    }

    return agent;
  }

  /**
   * Update an agent
   */
  async updateAgent(id: string, data: UpdateAgentInput): Promise<Agent | null> {
    const db = getDatabase();
    const now = new Date();

    const updateData: Partial<typeof agents.$inferInsert> = { updatedAt: now };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.upstreamUrl !== undefined) updateData.upstreamUrl = data.upstreamUrl;
    if (data.upstreamSecret !== undefined) updateData.upstreamSecret = data.upstreamSecret;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.requireConfirmation !== undefined) updateData.requireConfirmation = data.requireConfirmation;
    if (data.requiredCredentials !== undefined) {
      updateData.requiredCredentials = data.requiredCredentials
        ? JSON.stringify(data.requiredCredentials)
        : null;
    }

    await db
      .update(agents)
      .set(updateData)
      .where(eq(agents.id, id));

    this.tokenCache.invalidate();
    console.log(`[AgentService] Updated agent: ${id}`);
    return this.getAgent(id);
  }

  /**
   * Update an agent with tenant isolation check
   */
  async updateAgentForTenant(
    id: string,
    tenantId: string | undefined,
    data: UpdateAgentInput
  ): Promise<{ agent: Agent | null; error?: 'NOT_FOUND' | 'TENANT_MISMATCH' }> {
    const agent = await this.getAgent(id);
    if (!agent) return { agent: null, error: 'NOT_FOUND' };

    if (agent.tenantId && tenantId && agent.tenantId !== tenantId) {
      console.log(`[AgentService] Tenant mismatch on update: agent ${id} belongs to tenant ${agent.tenantId}, not ${tenantId}`);
      return { agent: null, error: 'TENANT_MISMATCH' };
    }

    const updated = await this.updateAgent(id, data);
    return { agent: updated };
  }

  /**
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<void> {
    const db = getDatabase();

    await db
      .delete(agents)
      .where(eq(agents.id, id));

    this.tokenCache.invalidate();
    console.log(`[AgentService] Deleted agent: ${id}`);
  }

  /**
   * Delete an agent with tenant isolation check
   */
  async deleteAgentForTenant(
    id: string,
    tenantId: string | undefined
  ): Promise<{ success: boolean; error?: 'NOT_FOUND' | 'TENANT_MISMATCH' }> {
    const agent = await this.getAgent(id);
    if (!agent) return { success: false, error: 'NOT_FOUND' };

    if (agent.tenantId && tenantId && agent.tenantId !== tenantId) {
      console.log(`[AgentService] Tenant mismatch on delete: agent ${id} belongs to tenant ${agent.tenantId}, not ${tenantId}`);
      return { success: false, error: 'TENANT_MISMATCH' };
    }

    await this.deleteAgent(id);
    return { success: true };
  }

  /**
   * List agents, optionally filtered by tenant
   */
  async listAgents(tenantId?: string): Promise<Agent[]> {
    const db = getDatabase();

    const result = tenantId
      ? await db.select().from(agents).where(eq(agents.tenantId, tenantId))
      : await db.select().from(agents);

    return result.map((row) => this.normalizeAgent(row));
  }

  // ==================== Kill Switch ====================

  async disableAgent(id: string): Promise<void> {
    await this.updateAgent(id, { isActive: false });
    console.log(`[AgentService] Disabled agent: ${id}`);
  }

  async enableAgent(id: string): Promise<void> {
    await this.updateAgent(id, { isActive: true });
    console.log(`[AgentService] Enabled agent: ${id}`);
  }

  // ==================== Runtime Token ====================

  /**
   * Verify an Agent Runtime Token (art_xxx).
   */
  async verifyRuntimeToken(token: string): Promise<Agent | null> {
    if (!token.startsWith('art_')) return null;

    const tokenHash = this.hashToken(token);

    const cached = this.tokenCache.get(tokenHash);
    // Cache can store null to short-circuit repeated invalid token lookups.
    if (cached !== undefined) return cached;

    const db = getDatabase();

    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.runtimeTokenHash, tokenHash))
      .limit(1);

    const agent = result.length === 0 ? null : this.normalizeAgent(result[0]);
    this.tokenCache.set(tokenHash, agent);
    return agent;
  }

  /**
   * Regenerate the runtime token for an agent.
   */
  async regenerateRuntimeToken(agentId: string): Promise<{ agent: Agent; runtimeToken: string } | null> {
    const db = getDatabase();

    const agent = await this.getAgent(agentId);
    if (!agent) return null;

    const plainToken = this.generateToken();
    const tokenHash = this.hashToken(plainToken);
    const tokenPrefix = plainToken.slice(0, 8);
    const now = new Date();

    await db
      .update(agents)
      .set({ runtimeTokenHash: tokenHash, runtimeTokenPrefix: tokenPrefix, updatedAt: now })
      .where(eq(agents.id, agentId));

    this.tokenCache.invalidate();
    console.log(`[AgentService] Regenerated runtime token for agent: ${agentId} (new prefix: ${tokenPrefix}...)`);

    const updatedAgent = await this.getAgent(agentId);
    return {
      agent: updatedAgent!,
      runtimeToken: plainToken,
    };
  }

  // ==================== Private Helpers ====================

  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(32);
    let result = 'art_';
    for (let i = 0; i < 32; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeAgent(row: Record<string, unknown>): Agent {
    let requiredCredentials = null;
    const requiredCredentialsRaw = row.requiredCredentials || row.required_credentials;
    if (requiredCredentialsRaw) {
      try {
        requiredCredentials = typeof requiredCredentialsRaw === 'string'
          ? JSON.parse(requiredCredentialsRaw)
          : requiredCredentialsRaw;
      } catch {
        // Invalid JSON, ignore
      }
    }

    return {
      id: String(row.id),
      name: String(row.name),
      upstreamUrl: String(row.upstreamUrl || row.upstream_url),
      upstreamSecret: (row.upstreamSecret || row.upstream_secret || null) as string | null,
      runtimeTokenPrefix: (row.runtimeTokenPrefix || row.runtime_token_prefix || null) as string | null,
      isActive: Boolean(row.isActive ?? row.is_active),
      requireConfirmation: Boolean(row.requireConfirmation ?? row.require_confirmation),
      requiredCredentials,
      tenantId: (row.tenantId || row.tenant_id || null) as string | null,
      ownerUserId: (row.ownerUserId || row.owner_user_id || null) as string | null,
      description: (row.description || null) as string | null,
      createdAt: row.createdAt instanceof Date
        ? row.createdAt
        : new Date((row.createdAt || row.created_at) as string | number | Date),
      updatedAt: row.updatedAt || row.updated_at
        ? (row.updatedAt instanceof Date
            ? row.updatedAt
            : new Date((row.updatedAt || row.updated_at) as string | number | Date))
        : null,
    };
  }
}

// Export singleton instance
export const agentService = new AgentService();
