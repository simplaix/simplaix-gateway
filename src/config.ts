/**
 * Gateway configuration management
 */

import type { GatewayConfig, PolicyRule } from './types/index.js';

// Default policy rules
const defaultPolicies: PolicyRule[] = [
  {
    tool: 'transfer_money',
    action: 'require_confirmation',
    risk: 'high',
    description: 'Financial transfers require human confirmation',
  },
  {
    tool: 'delete_*',
    action: 'require_confirmation',
    risk: 'critical',
    description: 'Delete operations require human confirmation',
  },
  {
    tool: 'write_*',
    action: 'require_confirmation',
    risk: 'medium',
    description: 'Write operations require human confirmation',
  },
  {
    tool: 'read_*',
    action: 'allow',
    risk: 'low',
    description: 'Read operations are allowed by default',
  },
  {
    tool: '*',
    action: 'allow',
    risk: 'low',
    description: 'Default: allow all other operations',
  },
];

// Parse external issuers from JSON environment variable
function parseExternalIssuers(): GatewayConfig['externalIssuers'] {
  const issuersJson = process.env.JWT_EXTERNAL_ISSUERS;
  if (!issuersJson) return [];

  try {
    const issuers = JSON.parse(issuersJson);
    if (!Array.isArray(issuers)) return [];
    return issuers.filter(
      (i) => i && typeof i.issuer === 'string'
    );
  } catch (e) {
    console.warn('[Config] Failed to parse JWT_EXTERNAL_ISSUERS:', e);
    return [];
  }
}

// Load configuration from environment variables
export function loadConfig(): GatewayConfig {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    // Gateway JWT config (for verification only — issuance is in gateway-app)
    jwtSecret: process.env.JWT_SECRET,
    jwtPublicKey: process.env.JWT_PUBLIC_KEY,
    jwtIssuer: process.env.JWT_ISSUER || 'simplaix-gateway',
    jwtAudience: process.env.JWT_AUDIENCE,
    // External JWT issuers (for Agent Consumers)
    externalIssuers: parseExternalIssuers(),
    // Initial admin user
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    // Credential system
    credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
    oauthCallbackBaseUrl: process.env.OAUTH_CALLBACK_BASE_URL,
    // Other config
    mcpServerUrl: process.env.MCP_SERVER_URL || 'http://localhost:8080',
    database: {
      postgresUrl: process.env.DATABASE_URL,
    },
    policies: defaultPolicies,
  };
}

// Global config instance
let config: GatewayConfig | null = null;

export function getConfig(): GatewayConfig {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

// Allow overriding config for testing
export function setConfig(newConfig: GatewayConfig): void {
  config = newConfig;
}

// Update policies at runtime
export function updatePolicies(policies: PolicyRule[]): void {
  const currentConfig = getConfig();
  currentConfig.policies = policies;
}
