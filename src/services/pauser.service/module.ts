/**
 * Request Pauser Service
 * Manages pending confirmation requests with event-driven architecture
 */

import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import type { PendingConfirmation, ConfirmationResult, RiskLevel, ConfirmationRequiredEvent } from '../../types/index.js';
import { auditService } from '../audit.service/index.js';

// Extend EventEmitter types
interface PauserEvents {
  confirmation_required: (event: ConfirmationRequiredEvent) => void;
  confirmation_resolved: (event: { id: string; confirmed: boolean; userId: string }) => void;
}

/**
 * Request Pauser - manages pending confirmation requests
 */
class RequestPauser {
  private pending = new Map<string, PendingConfirmation>();
  private emitter = new EventEmitter();
  private timeouts = new Map<string, NodeJS.Timeout>();
  
  // Default timeout for confirmation requests (5 minutes)
  private defaultTimeout = 5 * 60 * 1000;

  constructor() {
    // Increase max listeners for high-concurrency scenarios
    this.emitter.setMaxListeners(100);
  }

  /**
   * Pause a request and wait for confirmation
   * Returns a promise that resolves when the request is confirmed/rejected
   *
   * When `confirmationRequestId` is provided, the DB confirmation record is assumed to
   * already exist (created by the caller, e.g. mcp-proxy). Otherwise a new
   * record is created automatically (legacy behaviour).
   */
  async pause(request: {
    userId: string;
    tenantId?: string;
    toolName: string;
    arguments: Record<string, unknown>;
    risk: RiskLevel;
    timeout?: number;
    // Extended fields for tool-policy confirmation flow
    providerId?: string;
    agentId?: string;
    endUserId?: string;
    confirmationRequestId?: string;  // Pre-created DB record ID
    // Tool metadata for rich confirmation payload
    toolDescription?: string;
    toolInputSchema?: Record<string, unknown>;
    providerName?: string;
    agentName?: string;
  }): Promise<ConfirmationResult> {
    const id = request.confirmationRequestId || nanoid();
    const now = new Date();
    const timeout = request.timeout || this.defaultTimeout;

    // Only create a DB record if one wasn't already provided
    let confirmationDbId: string | undefined;
    if (!request.confirmationRequestId) {
      confirmationDbId = await auditService.recordConfirmation({
        requestId: id,
        userId: request.userId,
        tenantId: request.tenantId,
        toolName: request.toolName,
        arguments: request.arguments,
        risk: request.risk,
        providerId: request.providerId,
        agentId: request.agentId,
        endUserId: request.endUserId,
      });
    }

    return new Promise<ConfirmationResult>((resolve) => {
      // Store pending request
      const pendingRequest: PendingConfirmation = {
        id,
        userId: request.userId,
        tenantId: request.tenantId,
        toolName: request.toolName,
        arguments: request.arguments,
        risk: request.risk,
        createdAt: now,
        providerId: request.providerId,
        agentId: request.agentId,
        endUserId: request.endUserId,
        confirmationRequestId: id,
        toolDescription: request.toolDescription,
        toolInputSchema: request.toolInputSchema,
        providerName: request.providerName,
        agentName: request.agentName,
        resolve: (result: ConfirmationResult) => {
          // Update the DB confirmation record
          if (confirmationDbId) {
            auditService.updateConfirmation(
              confirmationDbId,
              result.confirmed,
              result.confirmedBy,
              result.reason
            ).catch(console.error);
          } else {
            // Record was pre-created — update by requestId
            auditService.updateConfirmationByRequestId(
              id,
              result.confirmed,
              result.confirmedBy,
              result.reason
            ).catch(console.error);
          }

          resolve(result);
        },
      };

      this.pending.set(id, pendingRequest);

      // Set timeout for automatic rejection
      const timeoutHandle = setTimeout(() => {
        if (this.pending.has(id)) {
          console.log(`[Pauser] Request ${id} timed out`);
          this.resume(id, {
            confirmed: false,
            reason: 'Request timed out',
          });
        }
      }, timeout);

      this.timeouts.set(id, timeoutHandle);

      // Emit event for SSE subscribers (admin dashboard visibility)
      const event: ConfirmationRequiredEvent = {
        id,
        tool: {
          name: request.toolName,
          description: request.toolDescription,
          inputSchema: request.toolInputSchema,
          provider: { id: request.providerId || '', name: request.providerName || '' },
        },
        arguments: request.arguments,
        risk: { level: request.risk },
        agent: request.agentId ? { id: request.agentId, name: request.agentName || '' } : undefined,
        user: { id: request.userId, endUserId: request.endUserId || request.userId },
        tenantId: request.tenantId,
        timestamp: now.toISOString(),
      };

      this.emitter.emit('confirmation_required', event);
      console.log(`[Pauser] Request ${id} paused, waiting for confirmation (${request.toolName})`);
      console.log(`[Pauser] SSE ConfirmationRequiredEvent:\n${JSON.stringify(event, null, 2)}`);
    });
  }

  /**
   * Resume a paused request with confirmation result
   */
  resume(id: string, result: ConfirmationResult): boolean {
    const request = this.pending.get(id);
    
    if (!request) {
      console.warn(`[Pauser] Request ${id} not found or already resolved`);
      return false;
    }

    // Clear timeout
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }

    // Remove from pending
    this.pending.delete(id);

    // Emit resolved event
    this.emitter.emit('confirmation_resolved', {
      id,
      confirmed: result.confirmed,
      userId: request.userId,
    });

    // Resolve the promise
    request.resolve(result);
    
    console.log(`[Pauser] Request ${id} ${result.confirmed ? 'confirmed' : 'rejected'}`);
    return true;
  }

  /**
   * Get pending request by ID
   */
  getPending(id: string): PendingConfirmation | undefined {
    return this.pending.get(id);
  }

  /**
   * Get all pending requests for a user (matches both userId and endUserId)
   */
  getPendingForUser(userId: string): PendingConfirmation[] {
    const requests: PendingConfirmation[] = [];
    for (const request of this.pending.values()) {
      if (request.userId === userId || request.endUserId === userId) {
        requests.push(request);
      }
    }
    return requests;
  }

  /**
   * Get all pending requests for a tenant
   */
  getPendingForTenant(tenantId: string): PendingConfirmation[] {
    const requests: PendingConfirmation[] = [];
    for (const request of this.pending.values()) {
      if (request.tenantId === tenantId) {
        requests.push(request);
      }
    }
    return requests;
  }

  /**
   * Subscribe to confirmation required events
   */
  onConfirmationRequired(
    callback: (event: ConfirmationRequiredEvent) => void
  ): () => void {
    this.emitter.on('confirmation_required', callback);
    return () => {
      this.emitter.off('confirmation_required', callback);
    };
  }

  /**
   * Subscribe to confirmation resolved events
   */
  onConfirmationResolved(
    callback: (event: { id: string; confirmed: boolean; userId: string }) => void
  ): () => void {
    this.emitter.on('confirmation_resolved', callback);
    return () => {
      this.emitter.off('confirmation_resolved', callback);
    };
  }

  /**
   * Get all pending requests
   */
  getAllPending(): PendingConfirmation[] {
    return Array.from(this.pending.values());
  }

  /**
   * Get count of pending requests
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Cancel all pending requests (for shutdown)
   */
  cancelAll(reason = 'Gateway shutdown'): void {
    for (const [id, request] of this.pending.entries()) {
      this.resume(id, { confirmed: false, reason });
    }
  }

  /**
   * Emit confirmation required event for SSE subscribers (non-blocking)
   * Used by the async confirmation flow to notify frontends
   */
  emitConfirmationRequired(data: {
    id: string;
    userId: string;
    tenantId?: string;
    toolName: string;
    toolDescription?: string;
    toolInputSchema?: Record<string, unknown>;
    providerId?: string;
    providerName?: string;
    arguments: Record<string, unknown>;
    risk: RiskLevel;
    agentId?: string;
    agentName?: string;
    endUserId?: string;
  }): void {
    const event: ConfirmationRequiredEvent = {
      id: data.id,
      tool: {
        name: data.toolName,
        description: data.toolDescription,
        inputSchema: data.toolInputSchema,
        provider: { id: data.providerId || '', name: data.providerName || '' },
      },
      arguments: data.arguments,
      risk: { level: data.risk },
      agent: data.agentId ? { id: data.agentId, name: data.agentName || '' } : undefined,
      user: { id: data.userId, endUserId: data.endUserId || data.userId },
      tenantId: data.tenantId,
      timestamp: new Date().toISOString(),
    };

    this.emitter.emit('confirmation_required', event);
    console.log(`[Pauser] Emitted confirmation_required event for ${data.id} (${data.toolName})${data.agentId ? ` agent=${data.agentId}` : ''}`);
  }

  /**
   * Emit confirmation resolved event for SSE subscribers (non-blocking)
   * Used when a confirmation is resolved to notify waiting clients
   */
  emitConfirmationResolved(data: {
    id: string;
    confirmed: boolean;
    userId: string;
  }): void {
    this.emitter.emit('confirmation_resolved', {
      id: data.id,
      confirmed: data.confirmed,
      userId: data.userId,
    });
    console.log(`[Pauser] Emitted confirmation_resolved event for ${data.id} (${data.confirmed ? 'confirmed' : 'rejected'})`);
  }
}

// Export singleton instance
export const requestPauser = new RequestPauser();
