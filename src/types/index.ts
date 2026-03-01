/**
 * Core type definitions for the MCP Gateway
 */

// User context extracted from JWT
export interface UserContext {
  id: string;
  tenantId?: string;
  email?: string;
  roles?: string[];
}

// MCP Tool Call request
export interface MCPToolCallRequest {
  method: string;
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

// MCP Tool Call response
export interface MCPToolCallResponse {
  content?: Array<{
    type: string;
    text?: string;
  }>;
  isError?: boolean;
}

// Pending confirmation request
export interface PendingConfirmation {
  id: string;
  userId: string;
  tenantId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  risk: RiskLevel;
  createdAt: Date;
  resolve: (result: ConfirmationResult) => void;
  // Extended fields for tool policy confirmation
  providerId?: string;
  agentId?: string;
  endUserId?: string;
  confirmationRequestId?: string;
  // Tool metadata for rich confirmation payload
  toolDescription?: string;
  toolInputSchema?: Record<string, unknown>;
  providerName?: string;
  agentName?: string;
}

// Confirmation result
export interface ConfirmationResult {
  confirmed: boolean;
  confirmedBy?: string;
  reason?: string;
}

// Risk levels for tool calls
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// Policy action types
export type PolicyAction = 'allow' | 'deny' | 'require_confirmation';

// Policy rule definition
export interface PolicyRule {
  tool: string; // supports glob patterns like 'read_*'
  action: PolicyAction;
  risk: RiskLevel;
  description?: string;
}

// Policy evaluation result
export interface PolicyEvaluationResult {
  action: PolicyAction;
  risk: RiskLevel;
  matchedRule?: PolicyRule;
}

// Policy evaluation context
export interface PolicyContext {
  toolName: string;
  arguments?: Record<string, unknown>;
  tenantId?: string;
  agentId?: string;
  endUserId?: string;
  endUserRoles?: string[];
}

// Audit log entry
export interface AuditLogEntry {
  id: string;
  userId: string;
  tenantId?: string;
  agentId?: string;
  endUserId?: string;
  providerId?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  confirmationId?: string;
  confirmedBy?: string;
  status: AuditStatus;
  duration?: number;
  createdAt: Date;
  completedAt?: Date;
}

// Audit status
export type AuditStatus = 'pending' | 'confirmed' | 'rejected' | 'completed' | 'failed';

// ==================== Confirmation Event Payload ====================

// Fixed semantic payload sent via SSE / Webhook / APNs when a tool call requires confirmation
export interface ConfirmationRequiredEvent {
  id: string;
  tool: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    provider: { id: string; name: string };
  };
  arguments: Record<string, unknown>;
  risk: { level: RiskLevel };
  agent?: { id: string; name: string };
  user: { id: string; endUserId?: string };
  tenantId?: string;
  timestamp: string;
}

// External JWT Issuer configuration (for Agent Consumers)
export interface ExternalIssuerConfig {
  issuer: string;          // e.g., "https://auth.mycompany.com"
  secret?: string;         // For HMAC (HS256) validation
  jwksUri?: string;        // For RSA/EC (RS256, ES256) validation via JWKS
  audience?: string;       // Expected audience claim
}

// Gateway configuration
export interface GatewayConfig {
  port: number;
  // Gateway JWT config (for verification only — issuance is in gateway-app)
  jwtSecret?: string;
  jwtPublicKey?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  // External JWT issuers (for Agent Consumers)
  externalIssuers?: ExternalIssuerConfig[];
  // Initial admin user
  adminEmail?: string;
  adminPassword?: string;
  // Credential system
  credentialEncryptionKey?: string;  // 64-char hex string for AES-256-GCM
  oauthCallbackBaseUrl?: string;     // Base URL for OAuth callbacks
  // Other config
  mcpServerUrl: string;
  database: DatabaseConfig;
  policies: PolicyRule[];
}

// Database configuration (PostgreSQL)
export interface DatabaseConfig {
  postgresUrl?: string;
}

// End-user context (when runtime passes headers)
export interface EndUserContext {
  id?: string;
  roles?: string[];
}

// Hono context variables
export interface GatewayVariables {
  user: UserContext;
  endUser?: EndUserContext;
  agentOwner?: UserContext;
  agent?: Agent;
  apiKey?: ApiKey;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  confirmationId?: string;
}

// ==================== Virtual Agent Identity ====================

// Virtual Agent - represents a registered agent identity
export interface Agent {
  id: string;
  name: string;
  upstreamUrl: string;
  upstreamSecret?: string | null;
  runtimeTokenPrefix?: string | null;
  isActive: boolean;
  requireConfirmation: boolean;
  requiredCredentials?: RequiredCredential[] | null;
  tenantId?: string | null;
  ownerUserId?: string | null;
  description?: string | null;
  createdAt: Date;
  updatedAt?: Date | null;
}

// Response type for agent creation / token regeneration (includes plaintext token shown once)
export interface AgentWithRuntimeToken extends Agent {
  runtimeToken: string;  // Plaintext art_xxx — shown only once
}

// Input types for creating/updating agents
export interface CreateAgentInput {
  name: string;
  upstreamUrl: string;
  upstreamSecret?: string;
  requireConfirmation?: boolean;
  requiredCredentials?: RequiredCredential[];
  tenantId?: string;
  ownerUserId?: string;
  description?: string;
}

export interface UpdateAgentInput {
  name?: string;
  upstreamUrl?: string;
  upstreamSecret?: string | null;
  isActive?: boolean;
  requireConfirmation?: boolean;
  requiredCredentials?: RequiredCredential[] | null;
  description?: string | null;
}

// ==================== Tool Providers ====================

// Tool Provider - maps tool patterns to MCP server endpoints
export interface ToolProvider {
  id: string;
  tenantId?: string;
  name: string;
  pattern: string;  // Glob pattern like 'slack_*', 'github_*'
  endpoint: string;
  authType: 'bearer' | 'api_key' | 'none';
  authSecret?: string;
  isActive: boolean;
  priority: number;
  description?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// Input for creating providers
export interface CreateToolProviderInput {
  tenantId?: string;
  name: string;
  pattern: string;
  endpoint: string;
  authType?: 'bearer' | 'api_key' | 'none';
  authSecret?: string;
  priority?: number;
  description?: string;
}

// ==================== Credential System ====================

// Credential Provider - admin-configured credential types
export interface CredentialProvider {
  id: string;
  tenantId?: string;
  serviceType: string;
  name: string;
  description?: string;
  authType: 'oauth2' | 'api_key' | 'jwt' | 'basic';
  config?: CredentialProviderConfig;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

// Configuration for different auth types
export interface CredentialProviderConfig {
  connectUrl?: string;

  // OAuth2 configuration
  oauth2?: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    defaultScopes: string[];
    callbackUrl?: string;
  };
  // API Key configuration
  apiKey?: {
    headerName: string;
    prefix?: string;
  };
  // JWT configuration
  jwt?: {
    headerName?: string;
    prefix?: string;
  };
  // Basic auth configuration
  basic?: {
    usernameField?: string;
    passwordField?: string;
  };
}

// User Credential - per-user stored credentials (public info, no secrets)
export interface UserCredential {
  id: string;
  userId: string;
  providerId: string;
  serviceType: string;
  providerName: string;
  scopes?: string[];
  expiresAt?: Date;
  hasRefreshToken: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

// Stored credential data (encrypted in DB)
export interface StoredCredentialData {
  token?: string;
  apiKey?: string;
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
  username?: string;
  password?: string;
  [key: string]: unknown;
}

// Result of credential resolution
export interface CredentialResolveResult {
  credentials: Record<string, string>;
  missing: string[];
  authUrls: Record<string, string>;
}

// Required credential declaration for agents/MCPs
export interface RequiredCredential {
  serviceType: string;
  scopes?: string[];
  description: string;
}

// Input for creating credential providers
export interface CreateCredentialProviderInput {
  tenantId?: string;
  serviceType: string;
  name: string;
  description?: string;
  authType: 'oauth2' | 'api_key' | 'jwt' | 'basic';
  config?: CredentialProviderConfig;
}

// Input for updating credential providers
export interface UpdateCredentialProviderInput {
  name?: string;
  description?: string | null;
  authType?: 'oauth2' | 'api_key' | 'jwt' | 'basic';
  config?: CredentialProviderConfig | null;
  isActive?: boolean;
}

// Input for storing user credentials
export interface StoreCredentialInput {
  providerId: string;
  credentials: StoredCredentialData;
  scopes?: string[];
  expiresAt?: Date;
  refreshToken?: string;
}

// ==================== Gateway API Keys ====================

// API Key scopes
export type ApiKeyScope = 'credentials:resolve' | 'credentials:read' | 'credentials:write';

// Gateway API Key - server-to-server authentication
export interface ApiKey {
  id: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  scopes: ApiKeyScope[];
  createdBy: string;
  tenantId?: string | null;
  isActive: boolean;
  createdAt: Date;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
}

// Input for creating API keys
export interface CreateApiKeyInput {
  name: string;
  scopes?: ApiKeyScope[];
  tenantId?: string;
  expiresAt?: Date;
}

// Result of API key verification
export interface ApiKeyVerificationResult {
  key: ApiKey;
}

// ==================== Provider Access Control ====================

// Subject type for access rules
export type AccessSubjectType = 'user' | 'agent';

// Access action
export type AccessAction = 'allow' | 'deny' | 'require_confirmation';

// Provider access rule - controls who can access which tool providers and tool-level policies
export interface ProviderAccessRule {
  id: string;
  tenantId?: string | null;
  subjectType: AccessSubjectType;
  subjectId: string;
  providerId: string;
  action: AccessAction;
  toolPattern?: string;
  confirmationMode?: 'always' | 'never' | null;
  riskLevel?: RiskLevel | null;
  description?: string | null;
  createdAt: Date;
  updatedAt?: Date | null;
}

// Input for creating provider access rules
export interface CreateProviderAccessRuleInput {
  tenantId?: string;
  subjectType: AccessSubjectType;
  subjectId: string;
  providerId: string;
  action: AccessAction;
  toolPattern?: string;
  confirmationMode?: 'always' | 'never';
  riskLevel?: RiskLevel;
  description?: string;
}

// Result of access check
export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  matchedRule?: ProviderAccessRule;
}

// Result of tool-level policy evaluation
export interface ToolPolicyResult {
  action: AccessAction;
  risk: RiskLevel;
  matchedRule?: ProviderAccessRule;
}
