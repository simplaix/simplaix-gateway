/**
 * Audit service for logging all tool calls and confirmations
 */

import { randomUUID } from 'node:crypto';
import { nanoid } from 'nanoid';
import { eq, desc, and, gte, lte, or } from 'drizzle-orm';
import { getDatabase } from '../../db/index.js';
import { auditLogs, confirmations } from '../../db/schema.js';
import type { AuditLogEntry, AuditStatus, RiskLevel } from '../../types/index.js';

/**
 * Audit service class for managing audit logs
 */
class AuditService {
  /**
   * Log a tool call
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<string> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();

    await db.insert(auditLogs).values({
      id,
      userId: entry.userId,
      tenantId: entry.tenantId || null,
      agentId: entry.agentId || null,
      endUserId: entry.endUserId || null,
      providerId: entry.providerId || null,
      toolName: entry.toolName,
      arguments: entry.arguments ? JSON.stringify(entry.arguments) : null,
      result: entry.result ? JSON.stringify(entry.result) : null,
      confirmationId: entry.confirmationId || null,
      confirmedBy: entry.confirmedBy || null,
      status: entry.status,
      duration: entry.duration || null,
      createdAt: now,
      completedAt: entry.completedAt || null,
    });

    return id;
  }

  /**
   * Update audit log status
   */
  async updateStatus(
    id: string,
    status: AuditStatus,
    result?: unknown,
    duration?: number
  ): Promise<void> {
    const db = getDatabase();

    await db
      .update(auditLogs)
      .set({
        status,
        result: result ? JSON.stringify(result) : null,
        duration: duration || null,
        completedAt: new Date(),
      })
      .where(eq(auditLogs.id, id));
  }

  /**
   * Get audit logs with filtering
   */
  async getLogs(options: {
    userId?: string;
    tenantId?: string;
    toolName?: string;
    status?: AuditStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> {
    const db = getDatabase();
    const { userId, tenantId, toolName, status, startDate, endDate, limit = 100, offset = 0 } = options;

    const conditions = [];
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (tenantId) conditions.push(eq(auditLogs.tenantId, tenantId));
    if (toolName) conditions.push(eq(auditLogs.toolName, toolName));
    if (status) conditions.push(eq(auditLogs.status, status));
    if (startDate) conditions.push(gte(auditLogs.createdAt, startDate));
    if (endDate) conditions.push(lte(auditLogs.createdAt, endDate));

    const query = db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const results = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    return results.map((row) => ({
      id: row.id,
      userId: row.userId,
      tenantId: row.tenantId || undefined,
      agentId: row.agentId || undefined,
      endUserId: row.endUserId || undefined,
      providerId: row.providerId || undefined,
      toolName: row.toolName,
      arguments: row.arguments ? JSON.parse(row.arguments) : undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      confirmationId: row.confirmationId || undefined,
      confirmedBy: row.confirmedBy || undefined,
      status: row.status,
      duration: row.duration || undefined,
      createdAt: row.createdAt,
      completedAt: row.completedAt || undefined,
    }));
  }

  /**
   * Get single audit log by ID
   */
  async getById(id: string): Promise<AuditLogEntry | null> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, id))
      .limit(1);

    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id,
      userId: row.userId,
      tenantId: row.tenantId || undefined,
      agentId: row.agentId || undefined,
      endUserId: row.endUserId || undefined,
      providerId: row.providerId || undefined,
      toolName: row.toolName,
      arguments: row.arguments ? JSON.parse(row.arguments) : undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      confirmationId: row.confirmationId || undefined,
      confirmedBy: row.confirmedBy || undefined,
      status: row.status,
      duration: row.duration || undefined,
      createdAt: row.createdAt,
      completedAt: row.completedAt || undefined,
    };
  }

  /**
   * Record a confirmation request
   */
  async recordConfirmation(data: {
    requestId: string;
    userId: string;
    tenantId?: string;
    toolName: string;
    arguments?: Record<string, unknown>;
    risk: RiskLevel;
    providerId?: string;
    agentId?: string;
    endUserId?: string;
    ruleId?: string;
  }): Promise<string> {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date();

    await db.insert(confirmations).values({
      id,
      requestId: data.requestId,
      userId: data.userId,
      tenantId: data.tenantId || null,
      toolName: data.toolName,
      arguments: data.arguments ? JSON.stringify(data.arguments) : null,
      risk: data.risk,
      status: 'pending',
      providerId: data.providerId || null,
      agentId: data.agentId || null,
      endUserId: data.endUserId || null,
      ruleId: data.ruleId || null,
      createdAt: now,
    });

    return id;
  }

  /**
   * Update confirmation status.
   * When confirmed, generates a one-time cryptographic token for replay protection.
   */
  async updateConfirmation(
    id: string,
    confirmed: boolean,
    confirmedBy?: string,
    reason?: string
  ): Promise<{ confirmationToken?: string }> {
    const db = getDatabase();
    const TOKEN_TTL_MINUTES = 30;

    const confirmationToken = confirmed ? `tok_${randomUUID()}` : undefined;
    const tokenExpiresAt = confirmed
      ? new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000)
      : undefined;

    await db
      .update(confirmations)
      .set({
        status: confirmed ? 'confirmed' : 'rejected',
        confirmedBy: confirmedBy || null,
        reason: reason || null,
        resolvedAt: new Date(),
        confirmationToken: confirmationToken || null,
        tokenExpiresAt: tokenExpiresAt || null,
      })
      .where(eq(confirmations.id, id));

    return { confirmationToken };
  }

  /**
   * Get confirmation by ID
   */
  async getConfirmation(id: string): Promise<{
    id: string;
    requestId: string;
    userId: string;
    tenantId?: string;
    toolName: string;
    arguments?: Record<string, unknown>;
    risk: RiskLevel;
    status: 'pending' | 'confirmed' | 'rejected' | 'expired' | 'consumed';
    confirmedBy?: string;
    reason?: string;
    createdAt: Date;
    resolvedAt?: Date;
  } | null> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(confirmations)
      .where(eq(confirmations.id, id))
      .limit(1);

    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id,
      requestId: row.requestId,
      userId: row.userId,
      tenantId: row.tenantId || undefined,
      toolName: row.toolName,
      arguments: row.arguments ? JSON.parse(row.arguments) : undefined,
      risk: row.risk,
      status: row.status,
      confirmedBy: row.confirmedBy || undefined,
      reason: row.reason || undefined,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt || undefined,
    };
  }

  /**
   * Get confirmation by request ID (the ID returned to clients)
   */
  async getConfirmationByRequestId(requestId: string): Promise<{
    id: string;
    requestId: string;
    userId: string;
    tenantId?: string | null;
    toolName: string;
    arguments?: Record<string, unknown>;
    risk: RiskLevel;
    status: 'pending' | 'confirmed' | 'rejected' | 'expired' | 'consumed';
    confirmedBy?: string;
    reason?: string;
    providerId?: string | null;
    agentId?: string | null;
    endUserId?: string | null;
    ruleId?: string | null;
    createdAt: Date;
    resolvedAt?: Date;
  } | null> {
    const db = getDatabase();

    const results = await db
      .select()
      .from(confirmations)
      .where(eq(confirmations.requestId, requestId))
      .limit(1);

    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id,
      requestId: row.requestId,
      userId: row.userId,
      tenantId: row.tenantId || undefined,
      toolName: row.toolName,
      arguments: row.arguments ? JSON.parse(row.arguments) : undefined,
      risk: row.risk,
      status: row.status,
      confirmedBy: row.confirmedBy || undefined,
      reason: row.reason || undefined,
      providerId: row.providerId,
      agentId: row.agentId,
      endUserId: row.endUserId,
      ruleId: row.ruleId,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt || undefined,
    };
  }

  /**
   * List confirmations from the DB, optionally filtered by status or user.
   */
  async listConfirmations(filters?: {
    status?: 'pending' | 'confirmed' | 'rejected' | 'expired' | 'consumed';
    userId?: string;
    tenantId?: string;
    limit?: number;
  }): Promise<{
    id: string;
    requestId: string;
    userId: string;
    tenantId?: string | null;
    toolName: string;
    arguments?: string | null;
    risk: string;
    status: string;
    confirmedBy?: string | null;
    reason?: string | null;
    providerId?: string | null;
    agentId?: string | null;
    endUserId?: string | null;
    ruleId?: string | null;
    createdAt: Date;
    resolvedAt?: Date | null;
  }[]> {
    const db = getDatabase();
    const limit = filters?.limit ?? 100;

    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(confirmations.status, filters.status));
    }
    if (filters?.userId) {
      // Include both initiator and end-user perspectives in user-scoped queries.
      conditions.push(
        or(
          eq(confirmations.userId, filters.userId),
          eq(confirmations.endUserId, filters.userId)
        )!
      );
    }
    if (filters?.tenantId) {
      conditions.push(eq(confirmations.tenantId, filters.tenantId));
    }

    const query = db
      .select()
      .from(confirmations)
      .orderBy(desc(confirmations.createdAt))
      .limit(limit);

    const results = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    return results.map((row) => ({
      id: row.id,
      requestId: row.requestId,
      userId: row.userId,
      tenantId: row.tenantId,
      toolName: row.toolName,
      arguments: row.arguments,
      risk: row.risk,
      status: row.status,
      confirmedBy: row.confirmedBy,
      reason: row.reason,
      providerId: row.providerId ?? null,
      agentId: row.agentId ?? null,
      endUserId: row.endUserId ?? null,
      ruleId: row.ruleId ?? null,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt ?? null,
    }));
  }

  /**
   * Update confirmation status by request ID.
   * When confirmed, generates a one-time cryptographic token for replay protection.
   */
  async updateConfirmationByRequestId(
    requestId: string,
    confirmed: boolean,
    confirmedBy?: string,
    reason?: string
  ): Promise<{ confirmationToken?: string }> {
    const db = getDatabase();
    const TOKEN_TTL_MINUTES = 30;

    const confirmationToken = confirmed ? `tok_${randomUUID()}` : undefined;
    const tokenExpiresAt = confirmed
      ? new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000)
      : undefined;

    await db
      .update(confirmations)
      .set({
        status: confirmed ? 'confirmed' : 'rejected',
        confirmedBy: confirmedBy || null,
        reason: reason || null,
        resolvedAt: new Date(),
        confirmationToken: confirmationToken || null,
        tokenExpiresAt: tokenExpiresAt || null,
      })
      .where(eq(confirmations.requestId, requestId));

    return { confirmationToken };
  }

  /**
   * Get audit log statistics
   */
  async getStats(options?: {
    tenantId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byTool: Record<string, number>;
  }> {
    const logs = await this.getLogs({
      tenantId: options?.tenantId,
      startDate: options?.startDate,
      endDate: options?.endDate,
      limit: 10000,
    });

    const byStatus: Record<string, number> = {};
    const byTool: Record<string, number> = {};

    for (const log of logs) {
      byStatus[log.status] = (byStatus[log.status] || 0) + 1;
      byTool[log.toolName] = (byTool[log.toolName] || 0) + 1;
    }

    return {
      total: logs.length,
      byStatus,
      byTool,
    };
  }
}

// Export singleton instance
export const auditService = new AuditService();
