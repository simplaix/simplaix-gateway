/**
 * Credential Provider Service
 * Manages credential provider configurations (Google, Slack, Gateway API, etc.)
 */

import { nanoid } from 'nanoid';
import { eq, and, isNull } from 'drizzle-orm';
import { getDatabase } from '../../db/index.js';
import { credentialProviders } from '../../db/schema.js';
import type { CredentialProvider, CredentialProviderConfig } from '../../types/index.js';

/**
 * Credential Provider Service
 */
class CredentialProviderService {
  /**
   * Create a new credential provider
   */
  async create(data: {
    tenantId?: string;
    serviceType: string;
    name: string;
    description?: string;
    authType: 'oauth2' | 'api_key' | 'jwt' | 'basic';
    config?: CredentialProviderConfig;
  }): Promise<CredentialProvider> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();

    const existing = await this.getByServiceType(data.serviceType, data.tenantId);
    if (existing) {
      throw new Error(`Credential provider with service type '${data.serviceType}' already exists`);
    }

    await db.insert(credentialProviders).values({
      id,
      tenantId: data.tenantId || null,
      serviceType: data.serviceType,
      name: data.name,
      description: data.description || null,
      authType: data.authType,
      config: data.config ? JSON.stringify(data.config) : null,
      isActive: true,
      createdAt: now,
    });

    return {
      id,
      tenantId: data.tenantId,
      serviceType: data.serviceType,
      name: data.name,
      description: data.description,
      authType: data.authType,
      config: data.config,
      isActive: true,
      createdAt: now,
    };
  }

  /**
   * Get a credential provider by ID
   */
  async getById(id: string): Promise<CredentialProvider | null> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(credentialProviders)
      .where(eq(credentialProviders.id, id))
      .limit(1);

    if (results.length === 0) return null;
    return this.normalizeProvider(results[0]);
  }

  /**
   * Get a credential provider by service type
   * Looks for tenant-specific first, then global
   */
  async getByServiceType(serviceType: string, tenantId?: string): Promise<CredentialProvider | null> {
    const db = getDatabase();

    if (tenantId) {
      const tenantResults = await db
        .select()
        .from(credentialProviders)
        .where(
          and(
            eq(credentialProviders.serviceType, serviceType),
            eq(credentialProviders.tenantId, tenantId),
            eq(credentialProviders.isActive, true)
          )
        )
        .limit(1);

      if (tenantResults.length > 0) {
        return this.normalizeProvider(tenantResults[0]);
      }
    }

    const globalResults = await db
      .select()
      .from(credentialProviders)
      .where(
        and(
          eq(credentialProviders.serviceType, serviceType),
          eq(credentialProviders.isActive, true),
          // Explicit global fallback only; avoids accidental cross-tenant leakage.
          isNull(credentialProviders.tenantId)
        )
      )
      .limit(1);

    if (globalResults.length === 0) return null;
    return this.normalizeProvider(globalResults[0]);
  }

  /**
   * List all credential providers for a tenant (including global)
   */
  async list(tenantId?: string): Promise<CredentialProvider[]> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(credentialProviders)
      .where(eq(credentialProviders.isActive, true));

    return results
      .filter((row) => row.tenantId === null || row.tenantId === tenantId)
      .map((row) => this.normalizeProvider(row));
  }

  /**
   * Update a credential provider
   */
  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      authType: 'oauth2' | 'api_key' | 'jwt' | 'basic';
      config: CredentialProviderConfig | null;
      isActive: boolean;
    }>
  ): Promise<CredentialProvider | null> {
    const db = getDatabase();

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.authType !== undefined) updateData.authType = data.authType;
    if (data.config !== undefined) {
      updateData.config = data.config ? JSON.stringify(data.config) : null;
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    await db
      .update(credentialProviders)
      .set(updateData)
      .where(eq(credentialProviders.id, id));

    return this.getById(id);
  }

  /**
   * Delete a credential provider
   */
  async delete(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(credentialProviders).where(eq(credentialProviders.id, id));
  }

  private normalizeProvider(row: Record<string, unknown>): CredentialProvider {
    const configStr = (row.config as string) || null;
    let config: CredentialProviderConfig | undefined;

    if (configStr) {
      try {
        config = JSON.parse(configStr);
      } catch {
        // Invalid JSON, ignore
      }
    }

    return {
      id: row.id as string,
      tenantId: (row.tenantId || row.tenant_id) as string | undefined,
      serviceType: (row.serviceType || row.service_type) as string,
      name: row.name as string,
      description: row.description as string | undefined,
      authType: (row.authType || row.auth_type) as 'oauth2' | 'api_key' | 'jwt' | 'basic',
      config,
      isActive: Boolean((row.isActive ?? row.is_active)),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt
          : new Date((row.createdAt || row.created_at) as number | string),
      updatedAt: (row.updatedAt || row.updated_at)
        ? row.updatedAt instanceof Date
          ? row.updatedAt
          : new Date((row.updatedAt || row.updated_at) as number | string)
        : undefined,
    };
  }
}

// Export singleton instance
export const credentialProviderService = new CredentialProviderService();
