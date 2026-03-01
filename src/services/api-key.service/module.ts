/**
 * API Key Service
 * Manages Gateway API Keys (gk_ prefix) for server-to-server authentication
 */

import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createHash, randomBytes } from 'crypto';
import { getDatabase } from '../../db/index.js';
import { apiKeys } from '../../db/schema.js';
import type {
  ApiKey,
  ApiKeyScope,
  CreateApiKeyInput,
  ApiKeyVerificationResult,
} from '../../types/index.js';

function hashKey(key: string): string {
  // Persist only deterministic hash; raw key is never stored.
  return createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(32);
  let key = 'gk_';
  for (let i = 0; i < 32; i++) {
    key += chars[bytes[i] % chars.length];
  }
  return key;
}

const DEFAULT_SCOPES: ApiKeyScope[] = ['credentials:resolve'];

/**
 * API Key Service class
 */
class ApiKeyService {
  /**
   * Create a new API key
   */
  async createKey(
    input: CreateApiKeyInput,
    createdBy: string
  ): Promise<{ key: string; record: ApiKey }> {
    const db = getDatabase();

    const rawKey = generateApiKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 7);
    const id = nanoid();
    const now = new Date();
    const scopes = input.scopes || DEFAULT_SCOPES;

    const keyData: ApiKey = {
      id,
      keyHash,
      keyPrefix,
      name: input.name,
      scopes,
      createdBy,
      tenantId: input.tenantId || null,
      isActive: true,
      createdAt: now,
      expiresAt: input.expiresAt || null,
      lastUsedAt: null,
    };

    await db.insert(apiKeys).values({
      id,
      keyHash,
      keyPrefix,
      name: input.name,
      scopes: JSON.stringify(scopes),
      createdBy,
      tenantId: input.tenantId || null,
      isActive: true,
      createdAt: now,
      expiresAt: input.expiresAt || null,
      lastUsedAt: null,
    });

    console.log(`[ApiKeyService] Created API key: ${keyPrefix}... (name: ${input.name})`);

    return { key: rawKey, record: keyData };
  }

  /**
   * Verify an API key and return the key record
   */
  async verifyKey(rawKey: string): Promise<ApiKeyVerificationResult | null> {
    if (!rawKey.startsWith('gk_')) return null;

    const db = getDatabase();
    const keyHash = hashKey(rawKey);

    const result = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, keyHash),
          eq(apiKeys.isActive, true)
        )
      )
      .limit(1);

    if (result.length === 0) return null;

    const keyRecord = this.normalizeKey(result[0]);

    if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
      console.log(`[ApiKeyService] API key expired: ${keyRecord.keyPrefix}...`);
      return null;
    }

    // Best-effort usage timestamp update should not block auth response.
    this.updateLastUsed(keyRecord.id).catch(console.error);

    return { key: keyRecord };
  }

  hasScope(key: ApiKey, scope: ApiKeyScope): boolean {
    return key.scopes.includes(scope);
  }

  /**
   * List API keys (metadata only, no key hashes)
   */
  async listKeys(createdBy?: string, tenantId?: string): Promise<ApiKey[]> {
    const db = getDatabase();

    let result: Array<typeof apiKeys.$inferSelect>;
    if (createdBy) {
      result = await db.select().from(apiKeys).where(eq(apiKeys.createdBy, createdBy));
    } else if (tenantId) {
      result = await db.select().from(apiKeys).where(eq(apiKeys.tenantId, tenantId));
    } else {
      result = await db.select().from(apiKeys);
    }

    return result.map((row) => this.normalizeKey(row));
  }

  /**
   * Revoke an API key
   */
  async revokeKey(keyId: string): Promise<void> {
    const db = getDatabase();

    await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, keyId));

    console.log(`[ApiKeyService] Revoked API key: ${keyId}`);
  }

  /**
   * Get an API key by ID
   */
  async getKeyById(keyId: string): Promise<ApiKey | null> {
    const db = getDatabase();

    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);

    if (result.length === 0) return null;

    return this.normalizeKey(result[0]);
  }

  // ==================== Private Helpers ====================

  private async updateLastUsed(keyId: string): Promise<void> {
    const db = getDatabase();
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId));
  }

  private normalizeKey(row: Record<string, unknown>): ApiKey {
    let scopes: ApiKeyScope[] = [];
    const scopesRaw = row.scopes;
    if (scopesRaw) {
      try {
        scopes = typeof scopesRaw === 'string' ? JSON.parse(scopesRaw) : scopesRaw;
      } catch {
        // Invalid JSON, default to empty
      }
    }

    return {
      id: String(row.id),
      keyHash: String(row.keyHash || row.key_hash),
      keyPrefix: String(row.keyPrefix || row.key_prefix),
      name: String(row.name),
      scopes,
      createdBy: String(row.createdBy || row.created_by),
      tenantId: (row.tenantId || row.tenant_id || null) as string | null,
      isActive: Boolean(row.isActive ?? row.is_active),
      createdAt: row.createdAt instanceof Date
        ? row.createdAt
        : new Date((row.createdAt || row.created_at) as string | number | Date),
      expiresAt: row.expiresAt || row.expires_at
        ? (row.expiresAt instanceof Date
            ? row.expiresAt
            : new Date((row.expiresAt || row.expires_at) as string | number | Date))
        : null,
      lastUsedAt: row.lastUsedAt || row.last_used_at
        ? (row.lastUsedAt instanceof Date
            ? row.lastUsedAt
            : new Date((row.lastUsedAt || row.last_used_at) as string | number | Date))
        : null,
    };
  }
}

// Export singleton instance
export const apiKeyService = new ApiKeyService();
