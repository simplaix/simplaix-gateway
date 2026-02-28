/**
 * User Credential Service
 * Manages user credentials for external services (Google, Slack, Gateway API, etc.)
 */

import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../../db/index.js';
import { userCredentials } from '../../db/schema.js';
import { encryptionService } from '../encryption.service/index.js';
import { credentialProviderService } from '../credential-provider.service/index.js';
import type { UserCredential, CredentialResolveResult, StoredCredentialData, CredentialProvider } from '../../types/index.js';

/**
 * User Credential Service
 */
class CredentialService {
  /**
   * Store a credential for a user
   */
  async storeCredential(data: {
    userId: string;
    providerId: string;
    credentials: StoredCredentialData;
    scopes?: string[];
    expiresAt?: Date;
    refreshToken?: string;
  }): Promise<UserCredential> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();

    const encryptedCredentials = encryptionService.encryptObject(data.credentials);
    const encryptedRefreshToken = data.refreshToken
      ? encryptionService.encrypt(data.refreshToken)
      : null;

    // Check if credential already exists for this user/provider
    const existing = await this.getUserCredentialByProvider(data.userId, data.providerId);
    if (existing) {
      return this.updateCredential(existing.id, {
        credentials: data.credentials,
        scopes: data.scopes,
        expiresAt: data.expiresAt,
        refreshToken: data.refreshToken,
      }) as Promise<UserCredential>;
    }

    await db.insert(userCredentials).values({
      id,
      userId: data.userId,
      providerId: data.providerId,
      credentials: encryptedCredentials,
      scopes: data.scopes ? JSON.stringify(data.scopes) : null,
      expiresAt: data.expiresAt || null,
      refreshToken: encryptedRefreshToken,
      createdAt: now,
    });

    const provider = await credentialProviderService.getById(data.providerId);

    return {
      id,
      userId: data.userId,
      providerId: data.providerId,
      serviceType: provider?.serviceType || 'unknown',
      providerName: provider?.name || 'Unknown',
      scopes: data.scopes,
      expiresAt: data.expiresAt,
      hasRefreshToken: !!data.refreshToken,
      createdAt: now,
    };
  }

  /**
   * Get a user credential by ID
   */
  async getById(id: string): Promise<UserCredential | null> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.id, id))
      .limit(1);

    if (results.length === 0) return null;
    return this.normalizeCredential(results[0]);
  }

  /**
   * Get a user credential by provider ID
   */
  async getUserCredentialByProvider(userId: string, providerId: string): Promise<UserCredential | null> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(userCredentials)
      .where(
        and(
          eq(userCredentials.userId, userId),
          eq(userCredentials.providerId, providerId)
        )
      )
      .limit(1);

    if (results.length === 0) return null;
    return this.normalizeCredential(results[0]);
  }

  /**
   * Get a user credential by service type
   */
  async getUserCredentialByServiceType(
    userId: string,
    serviceType: string,
    tenantId?: string
  ): Promise<{ credential: UserCredential; decryptedCredentials: StoredCredentialData } | null> {
    const provider = await credentialProviderService.getByServiceType(serviceType, tenantId);
    if (!provider) return null;

    const credential = await this.getUserCredentialByProvider(userId, provider.id);
    if (!credential) return null;

    const decryptedCredentials = await this.getDecryptedCredentials(credential.id);
    if (!decryptedCredentials) return null;

    return { credential, decryptedCredentials };
  }

  /**
   * Get decrypted credentials for a user credential
   */
  async getDecryptedCredentials(credentialId: string): Promise<StoredCredentialData | null> {
    const db = getDatabase();

    const results = await db
      .select({ credentials: userCredentials.credentials })
      .from(userCredentials)
      .where(eq(userCredentials.id, credentialId))
      .limit(1);

    if (results.length === 0) return null;
    const encryptedCredentials = results[0].credentials;

    if (!encryptedCredentials) return null;

    try {
      return encryptionService.decryptObject<StoredCredentialData>(encryptedCredentials);
    } catch (error) {
      console.error('[CredentialService] Failed to decrypt credentials:', error);
      return null;
    }
  }

  /**
   * List all credentials for a user
   */
  async listUserCredentials(userId: string): Promise<UserCredential[]> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId));

    return Promise.all(results.map((row) => this.normalizeCredential(row)));
  }

  /**
   * Resolve credentials for multiple service types
   */
  async resolveCredentials(
    userId: string,
    serviceTypes: string[],
    tenantId?: string
  ): Promise<CredentialResolveResult> {
    const credentials: Record<string, string> = {};
    const missing: string[] = [];
    const authUrls: Record<string, string> = {};

    for (const serviceType of serviceTypes) {
      const result = await this.getUserCredentialByServiceType(userId, serviceType, tenantId);

      if (result) {
        if (result.credential.expiresAt && result.credential.expiresAt < new Date()) {
          if (result.credential.hasRefreshToken) {
            const refreshed = await this.refreshToken(result.credential.id);
            if (refreshed) {
              const refreshedCreds = await this.getDecryptedCredentials(result.credential.id);
              if (refreshedCreds) {
                credentials[serviceType] = this.extractToken(refreshedCreds);
                continue;
              }
            }
          }
          missing.push(serviceType);
          const provider = await credentialProviderService.getByServiceType(serviceType, tenantId);
          if (provider) authUrls[serviceType] = this.getAuthUrl(provider);
        } else {
          credentials[serviceType] = this.extractToken(result.decryptedCredentials);
        }
      } else {
        missing.push(serviceType);
        const provider = await credentialProviderService.getByServiceType(serviceType, tenantId);
        if (provider) authUrls[serviceType] = this.getAuthUrl(provider);
      }
    }

    return { credentials, missing, authUrls };
  }

  /**
   * Update a credential
   */
  async updateCredential(
    id: string,
    data: Partial<{
      credentials: StoredCredentialData;
      scopes: string[];
      expiresAt: Date | null;
      refreshToken: string | null;
    }>
  ): Promise<UserCredential | null> {
    const db = getDatabase();

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.credentials !== undefined) {
      updateData.credentials = encryptionService.encryptObject(data.credentials);
    }
    if (data.scopes !== undefined) {
      updateData.scopes = data.scopes ? JSON.stringify(data.scopes) : null;
    }
    if (data.expiresAt !== undefined) {
      updateData.expiresAt = data.expiresAt;
    }
    if (data.refreshToken !== undefined) {
      updateData.refreshToken = data.refreshToken
        ? encryptionService.encrypt(data.refreshToken)
        : null;
    }

    await db
      .update(userCredentials)
      .set(updateData)
      .where(eq(userCredentials.id, id));

    return this.getById(id);
  }

  /**
   * Delete a credential
   */
  async deleteCredential(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(userCredentials).where(eq(userCredentials.id, id));
  }

  /**
   * Refresh an OAuth token (placeholder)
   */
  async refreshToken(credentialId: string): Promise<boolean> {
    console.log(`[CredentialService] Token refresh not implemented for credential ${credentialId}`);
    return false;
  }

  private extractToken(credentials: StoredCredentialData): string {
    if (typeof credentials === 'string') return credentials;
    if (credentials.accessToken) return credentials.accessToken;
    if (credentials.token) return credentials.token;
    if (credentials.apiKey) return credentials.apiKey;
    return JSON.stringify(credentials);
  }

  private getAuthUrl(provider: CredentialProvider): string {
    if (provider.config?.connectUrl) return provider.config.connectUrl;
    if (provider.authType === 'oauth2' && provider.config?.oauth2?.authorizationUrl) {
      return `/api/v1/credentials/oauth/${provider.serviceType}/auth`;
    }
    return `/auth/connect?service=${provider.serviceType}`;
  }

  private async normalizeCredential(row: Record<string, unknown>): Promise<UserCredential> {
    const scopesStr = (row.scopes as string) || null;
    let scopes: string[] | undefined;

    if (scopesStr) {
      try {
        scopes = JSON.parse(scopesStr);
      } catch {
        scopes = scopesStr.split(',').map(s => s.trim());
      }
    }

    const providerId = (row.providerId || row.provider_id) as string;
    const provider = await credentialProviderService.getById(providerId);

    const expiresAtRaw = row.expiresAt || row.expires_at;
    let expiresAt: Date | undefined;
    if (expiresAtRaw) {
      expiresAt = expiresAtRaw instanceof Date
        ? expiresAtRaw
        : new Date(expiresAtRaw as number | string);
    }

    return {
      id: row.id as string,
      userId: (row.userId || row.user_id) as string,
      providerId,
      serviceType: provider?.serviceType || 'unknown',
      providerName: provider?.name || 'Unknown',
      scopes,
      expiresAt,
      hasRefreshToken: !!(row.refreshToken || row.refresh_token),
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
export const credentialService = new CredentialService();
