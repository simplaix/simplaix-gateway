/**
 * Gateway API Client for frontend
 *
 * This client calls the Next.js API routes which proxy to the gateway backend.
 * It automatically includes the user's JWT token from localStorage.
 */

import { Agent } from "@/components/agents/agent-card";
import { ToolProvider } from "@/components/providers/provider-card";
import { AuditLog } from "@/components/audit/audit-table";
import { AuditStats } from "@/components/audit/audit-stats";
import { getStoredToken } from "@/contexts/auth-context";

// Response types
interface ApiResponse<T> {
  success: boolean;
  error?: string;
  data?: T;
}

interface ListAgentsResponse {
  agents: Agent[];
  count: number;
}

interface CreateAgentInput {
  name: string;
  upstreamUrl: string;
  description?: string;
  requireConfirmation?: boolean;
}

interface UpdateAgentInput {
  name?: string;
  upstreamUrl?: string;
  description?: string;
  requireConfirmation?: boolean;
}

interface CreateProviderInput {
  name: string;
  pattern: string;
  endpoint: string;
  authType?: "none" | "bearer" | "api_key";
  authSecret?: string;
  description?: string;
  priority?: number;
}

interface UpdateProviderInput {
  name?: string;
  pattern?: string;
  endpoint?: string;
  authType?: "none" | "bearer" | "api_key";
  authSecret?: string;
  description?: string;
  priority?: number;
  isActive?: boolean;
}

// Confirmation response type (from /confirmations API)
export interface Confirmation {
  id: string;
  requestId: string;
  userId: string;
  tenantId?: string | null;
  toolName: string;
  arguments?: Record<string, unknown> | string | null;
  risk: "low" | "medium" | "high" | "critical";
  status: "pending" | "confirmed" | "rejected" | "expired";
  confirmedBy?: string | null;
  reason?: string | null;
  providerId?: string | null;
  agentId?: string | null;
  endUserId?: string | null;
  ruleId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

// API Base URL
const API_BASE = "/api/gateway";

/**
 * Get auth headers for API requests.
 * Sends the JWT as a standard Authorization: Bearer header.
 * The gateway backend verifies the token and extracts user identity.
 */
function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  return {};
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Request failed with status ${response.status}`,
      };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ==================== Agent Management ====================

export async function listAgents(): Promise<ApiResponse<ListAgentsResponse>> {
  return apiRequest<ListAgentsResponse>("/agents");
}

export async function getAgent(agentId: string): Promise<ApiResponse<Agent>> {
  return apiRequest<Agent>(`/agents/${agentId}`);
}

// Response from creating an agent — includes the plaintext runtime token (shown once)
export interface CreateAgentResponse {
  success: boolean;
  agent: Agent;
  runtime_token: string;
}

export async function createAgent(
  input: CreateAgentInput
): Promise<ApiResponse<CreateAgentResponse>> {
  return apiRequest<CreateAgentResponse>("/agents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Response from regenerating an agent's runtime token
export interface RegenerateTokenResponse {
  success: boolean;
  agent: { id: string; name: string; runtimeTokenPrefix: string };
  runtime_token: string;
}

export async function regenerateAgentToken(
  agentId: string
): Promise<ApiResponse<RegenerateTokenResponse>> {
  return apiRequest<RegenerateTokenResponse>(`/agents/${agentId}/regenerate-token`, {
    method: "POST",
  });
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput
): Promise<ApiResponse<Agent>> {
  return apiRequest<Agent>(`/agents/${agentId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteAgent(agentId: string): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/agents/${agentId}`, {
    method: "DELETE",
  });
}

export async function enableAgent(agentId: string): Promise<ApiResponse<Agent>> {
  return apiRequest<Agent>(`/agents/${agentId}/enable`, {
    method: "POST",
  });
}

export async function disableAgent(agentId: string): Promise<ApiResponse<Agent>> {
  return apiRequest<Agent>(`/agents/${agentId}/disable`, {
    method: "POST",
  });
}

// ==================== Agent Token Management ====================

import type { Token } from "@/components/tokens/token-card";

export async function listTokens(
  agentId: string
): Promise<ApiResponse<{ tokens: Token[] }>> {
  return apiRequest<{ tokens: Token[] }>(`/agents/${agentId}/tokens`);
}

export async function createToken(
  agentId: string,
  input: { name: string; expiresInDays?: number }
): Promise<ApiResponse<{ token: string; tokenRecord: Token }>> {
  return apiRequest<{ token: string; tokenRecord: Token }>(
    `/agents/${agentId}/tokens`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export async function revokeToken(
  tokenId: string
): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/tokens/${tokenId}`, {
    method: "DELETE",
  });
}

export async function rotateToken(
  tokenId: string
): Promise<ApiResponse<{ token: string; tokenRecord: Token }>> {
  return apiRequest<{ token: string; tokenRecord: Token }>(
    `/tokens/${tokenId}/rotate`,
    { method: "POST" }
  );
}

// ==================== Tool Provider Management ====================

export async function listProviders(): Promise<
  ApiResponse<{ providers: ToolProvider[]; count: number }>
> {
  return apiRequest<{ providers: ToolProvider[]; count: number }>("/providers");
}

export async function createProvider(
  input: CreateProviderInput
): Promise<ApiResponse<ToolProvider>> {
  return apiRequest<ToolProvider>("/providers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProvider(
  providerId: string,
  input: UpdateProviderInput
): Promise<ApiResponse<ToolProvider>> {
  return apiRequest<ToolProvider>(`/providers/${providerId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteProvider(
  providerId: string
): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/providers/${providerId}`, {
    method: "DELETE",
  });
}

// ==================== Provider Tools ====================

export interface ProviderTool {
  name: string;
  description?: string | null;
}

export async function getProviderTools(
  providerId: string
): Promise<ApiResponse<{ providerId: string; tools: ProviderTool[] }>> {
  return apiRequest<{ providerId: string; tools: ProviderTool[] }>(
    `/providers/${providerId}/tools`
  );
}

// ==================== Confirmation Management ====================

export async function listConfirmations(): Promise<
  ApiResponse<{ confirmations: Confirmation[]; count: number }>
> {
  return apiRequest<{ confirmations: Confirmation[]; count: number }>("/confirmations");
}

export async function confirmRequest(
  confirmationId: string,
  reason?: string
): Promise<ApiResponse<Confirmation>> {
  return apiRequest<Confirmation>(`/confirmations/${confirmationId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function rejectRequest(
  confirmationId: string,
  reason?: string
): Promise<ApiResponse<Confirmation>> {
  return apiRequest<Confirmation>(`/confirmations/${confirmationId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ==================== Audit Logs ====================

export async function getAuditLogs(params?: {
  limit?: number;
  status?: string;
  toolName?: string;
  agentId?: string;
}): Promise<ApiResponse<{ logs: AuditLog[]; count: number }>> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.status) searchParams.set("status", params.status);
  if (params?.toolName) searchParams.set("tool_name", params.toolName);
  if (params?.agentId) searchParams.set("agent_id", params.agentId);

  const query = searchParams.toString();
  return apiRequest<{ logs: AuditLog[]; count: number }>(
    `/audit/logs${query ? `?${query}` : ""}`
  );
}

export async function getAuditStats(): Promise<ApiResponse<AuditStats>> {
  return apiRequest<AuditStats>("/audit/stats");
}

// ==================== API Key Management ====================

export interface GatewayApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  createdBy: string;
  tenantId?: string | null;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
}

export interface NewGatewayApiKey extends GatewayApiKey {
  key: string; // Full key value, only shown once
}

interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  expiresAt?: string;
}

export async function listApiKeys(): Promise<
  ApiResponse<{ keys: GatewayApiKey[]; count: number }>
> {
  return apiRequest<{ keys: GatewayApiKey[]; count: number }>("/api-keys");
}

export async function createApiKey(
  input: CreateApiKeyInput
): Promise<ApiResponse<NewGatewayApiKey>> {
  return apiRequest<NewGatewayApiKey>("/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeApiKey(
  keyId: string
): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/api-keys/${keyId}`, {
    method: "DELETE",
  });
}

// ==================== Provider Access Policies ====================

export interface PolicyRule {
  id: string;
  tenantId?: string | null;
  subjectType: "user" | "agent";
  subjectId: string;
  providerId: string;
  action: "allow" | "deny" | "require_confirmation";
  toolPattern: string;
  confirmationMode?: "always" | "never" | null;
  riskLevel?: "low" | "medium" | "high" | "critical" | null;
  description?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

interface CreatePolicyInput {
  subjectType: "user" | "agent";
  subjectId: string;
  providerId: string;
  action: "allow" | "deny" | "require_confirmation";
  toolPattern?: string;
  confirmationMode?: "always" | "never";
  riskLevel?: "low" | "medium" | "high" | "critical";
  description?: string;
}

interface UpdatePolicyInput {
  subjectType?: "user" | "agent";
  subjectId?: string;
  providerId?: string;
  action?: "allow" | "deny" | "require_confirmation";
  toolPattern?: string;
  confirmationMode?: "always" | "never" | null;
  riskLevel?: "low" | "medium" | "high" | "critical" | null;
  description?: string | null;
}

export async function listPolicies(filters?: {
  providerId?: string;
  action?: string;
  toolPattern?: string;
}): Promise<ApiResponse<{ rules: PolicyRule[] }>> {
  const params = new URLSearchParams();
  if (filters?.providerId) params.set("provider_id", filters.providerId);
  if (filters?.action) params.set("action", filters.action);
  if (filters?.toolPattern) params.set("tool_pattern", filters.toolPattern);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ rules: PolicyRule[] }>(`/provider-access${qs}`);
}

export async function getPolicy(
  id: string
): Promise<ApiResponse<{ rule: PolicyRule }>> {
  return apiRequest<{ rule: PolicyRule }>(`/provider-access/${id}`);
}

export async function createPolicy(
  input: CreatePolicyInput
): Promise<ApiResponse<{ rule: PolicyRule }>> {
  return apiRequest<{ rule: PolicyRule }>("/provider-access", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePolicy(
  id: string,
  input: UpdatePolicyInput
): Promise<ApiResponse<{ rule: PolicyRule }>> {
  return apiRequest<{ rule: PolicyRule }>(`/provider-access/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deletePolicy(
  id: string
): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/provider-access/${id}`, {
    method: "DELETE",
  });
}

export async function evaluatePolicy(input: {
  userId: string;
  providerId: string;
  toolName: string;
  agentId?: string;
}): Promise<
  ApiResponse<{
    action: string;
    risk: string;
    matchedRule: PolicyRule | null;
  }>
> {
  return apiRequest("/provider-access/evaluate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ==================== Agent Provider Access ====================

export interface AgentProviderRule {
  providerId: string;
  action: "allow" | "deny" | "require_confirmation";
  toolPattern?: string;
  riskLevel?: string;
  description?: string;
}

export async function getAgentProviderAccess(
  agentId: string
): Promise<ApiResponse<{ agentId: string; rules: PolicyRule[] }>> {
  return apiRequest<{ agentId: string; rules: PolicyRule[] }>(
    `/provider-access/agent/${agentId}`
  );
}

export async function setAgentProviderAccess(
  agentId: string,
  rules: AgentProviderRule[]
): Promise<ApiResponse<{ agentId: string; rules: PolicyRule[] }>> {
  return apiRequest<{ agentId: string; rules: PolicyRule[] }>(
    `/provider-access/agent/${agentId}`,
    {
      method: "PUT",
      body: JSON.stringify({ rules }),
    }
  );
}

// ==================== Health Check ====================

export async function checkHealth(): Promise<
  ApiResponse<{ status: string; services?: Record<string, unknown> }>
> {
  return apiRequest<{ status: string; services?: Record<string, unknown> }>(
    "/health"
  );
}
