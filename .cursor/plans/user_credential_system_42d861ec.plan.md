---
name: User Credential System
overview: Implement a centralized User Credential Vault in Gateway Core that stores per-user credentials for external services. Supports both MCP tools (auto-injection) and local tools (SDK-based access). Start with Gateway API as the first credential provider.
todos:
  - id: schema
    content: Add credential_providers and user_credentials tables to database schema, add required_credentials to agents
    status: completed
  - id: encryption
    content: Create encryption service for secure credential storage (AES-256-GCM)
    status: completed
  - id: provider-service
    content: Create credential provider service with CRUD operations
    status: completed
  - id: credential-service
    content: Create user credential service with resolve, store, delete, refresh operations
    status: completed
  - id: provider-routes
    content: Create admin API routes for credential provider management
    status: completed
  - id: credential-routes
    content: Create user API routes for credential management (list, delete, add JWT/API key)
    status: completed
  - id: mcp-integration
    content: Integrate credential resolution and injection into MCP proxy service
    status: completed
  - id: credential-sdk
    content: Create credential SDK package (packages/credential-sdk) for local tools to access credentials
    status: completed
  - id: agent-update
    content: Update agent registration to support required_credentials field
    status: completed
  - id: types-config
    content: Add types and config for credential system
    status: completed
isProject: false
---

# User Credential System Implementation

## Architecture Overview

The system supports **two types of tools**:

1. **MCP Tools** - Credentials auto-injected at the Gateway proxy layer
2. **Local Tools** - CopilotKit actions that use an SDK to fetch credentials

```mermaid
flowchart TB
    subgraph Apps[Upstream Apps]
        GatewayApp[Gateway App]
        FinancialApp[Financial App]
        OtherApp[Other Apps]
    end
    
    subgraph GatewayCore[Gateway Core]
        Auth[Auth Middleware]
        CredVault[User Credential Vault]
        CredProviders[Credential Providers]
        MCPProxy[MCP Proxy]
        ResolveAPI[Resolve API]
    end
    
    subgraph Tools[Tool Types]
        MCPTools[MCP Tools]
        LocalTools[Local Tools / CopilotKit Actions]
    end
    
    subgraph Downstream[Downstream Services]
        GatewayAPI[Gateway API]
        GoogleAPI[Google API]
        SlackAPI[Slack API]
    end
    
    Apps --> Auth
    Auth --> MCPProxy
    MCPProxy -->|Auto-inject| MCPTools
    MCPTools --> Downstream
    
    LocalTools -->|SDK call| ResolveAPI
    ResolveAPI --> CredVault
    LocalTools --> Downstream
```



## Database Schema Changes

Add two new tables to [src/db/schema.ts](src/db/schema.ts):

**1. `credential_providers` table** - Admin-configured credential types:

- `id`, `tenant_id`, `service_type` (unique identifier like `gateway_api`, `google`)
- `name`, `description`, `auth_type` (`oauth2`, `api_key`, `jwt`, `basic`)
- `config` (JSON: OAuth2 URLs, API key header names, etc.)
- `is_active`, `created_at`, `updated_at`

**2. `user_credentials` table** - Per-user stored credentials:

- `id`, `user_id`, `provider_id` (FK to credential_providers)
- `credentials` (encrypted JSON: tokens, API keys, etc.)
- `scopes` (granted OAuth scopes)
- `expires_at`, `refresh_token` (encrypted)
- `created_at`, `updated_at`

**3. Modify `agents` table** - Add `required_credentials` column:

- JSON array of `{ serviceType: string, scopes?: string[], description: string }`

## New Services

**1. [src/services/credential-provider.service.ts**](src/services/credential-provider.service.ts)

- CRUD for credential providers
- `getByServiceType(serviceType, tenantId)` - resolve provider config

**2. [src/services/credential.service.ts**](src/services/credential.service.ts)

- `getUserCredential(userId, serviceType)` - get decrypted credential
- `storeCredential(userId, providerId, credentials)` - encrypt and store
- `deleteCredential(credentialId)` - remove user credential
- `resolveCredentials(userId, serviceTypes[])` - batch resolve for MCP call
- `refreshToken(credentialId)` - refresh OAuth tokens if expired

**3. [src/services/encryption.service.ts**](src/services/encryption.service.ts)

- `encrypt(data)` / `decrypt(data)` using AES-256-GCM
- Key from `CREDENTIAL_ENCRYPTION_KEY` env var

## New API Routes

**1. [src/routes/credentials.ts**](src/routes/credentials.ts) - User credential management:

```
GET    /api/v1/credentials              - List my credentials
DELETE /api/v1/credentials/:id          - Delete a credential
POST   /api/v1/credentials/apikey       - Add API key credential
POST   /api/v1/credentials/jwt          - Add JWT credential (for Gateway API)
GET    /api/v1/credentials/oauth/:type/auth     - Get OAuth auth URL (placeholder)
GET    /api/v1/credentials/oauth/:type/callback - OAuth callback (placeholder)
POST   /api/v1/credentials/resolve      - Internal: resolve credentials for MCP
```

**2. [src/routes/credential-providers.ts**](src/routes/credential-providers.ts) - Admin management:

```
GET    /api/v1/credential-providers          - List providers
POST   /api/v1/credential-providers          - Create provider
PUT    /api/v1/credential-providers/:id      - Update provider
DELETE /api/v1/credential-providers/:id      - Delete provider
```

## MCP Proxy Integration (Auto-Injection for MCP Tools)

Modify [src/services/mcp-proxy.service.ts](src/services/mcp-proxy.service.ts):

1. Before calling upstream MCP, check agent's `required_credentials`
2. Call `credentialService.resolveCredentials(userId, requiredTypes)`
3. If credentials missing, return `{ needsAuth: true, serviceType, authUrl }`
4. If credentials present, inject into request headers/body based on provider config
5. Handle token refresh if OAuth token expired

## Credential SDK Package for Local Tools

For local tools (CopilotKit actions, etc.) making API calls, provide an SDK as a **separate distributable package**.

**Package Structure: `packages/credential-sdk/**`

```
packages/
└── credential-sdk/
    ├── package.json          # @simplaix/credential-sdk
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts          # Main exports
    │   ├── client.ts         # CredentialClient class
    │   ├── types.ts          # Type definitions
    │   └── errors.ts         # Custom error classes
    └── README.md
```

**SDK Interface (`packages/credential-sdk/src/client.ts`)**:

```typescript
export interface CredentialClientOptions {
  gatewayUrl: string;
  userToken: string;
}

export interface CredentialResult {
  credentials: Record<string, string>;  // { serviceType: token }
  missing: string[];                     // Missing service types
  authUrls: Record<string, string>;      // Auth URLs for missing credentials
}

export class CredentialClient {
  constructor(options: CredentialClientOptions);

  // Get credentials for one or more services
  async resolve(serviceTypes: string[]): Promise<CredentialResult>;

  // Convenience method for single credential
  async getCredential(serviceType: string): Promise<string | null>;

  // Check if credential exists
  async hasCredential(serviceType: string): Promise<boolean>;

  // Get auth URL for a service (to show "Connect" button)
  async getAuthUrl(serviceType: string): Promise<string | null>;
}

// Factory function
export function createCredentialClient(
  gatewayUrl: string, 
  userToken: string
): CredentialClient;
```

**Usage in Any App (Gateway App, Financial App, etc.)**:

```typescript
// Install: pnpm add @simplaix/credential-sdk (or workspace reference)
import { createCredentialClient } from '@simplaix/credential-sdk';

const myAction = {
  name: 'create_task',
  handler: async ({ userToken, ...args }) => {
    const client = createCredentialClient(
      process.env.GATEWAY_URL!,
      userToken
    );
    
    // Get Gateway API credential
    const result = await client.resolve(['gateway_api']);
    
    if (result.missing.length > 0) {
      return { 
        needsAuth: true, 
        serviceType: 'gateway_api',
        authUrl: result.authUrls['gateway_api']
      };
    }
    
    // Use credential to call Gateway API
    const response = await fetch(`${process.env.GATEWAY_URL}/api/v1/tasks`, {
      headers: { 'Authorization': `Bearer ${result.credentials['gateway_api']}` }
    });
    
    return response.json();
  }
};
```

**Workspace Configuration** (update root `pnpm-workspace.yaml`):

```yaml
packages:
  - 'gateway-app'
  - 'packages/*'
```

## Credential Flow: MCP Tools (Auto-Injection)

```mermaid
sequenceDiagram
    participant App as Upstream App
    participant GW as Gateway
    participant Vault as Credential Vault
    participant MCP as MCP Server
    participant API as External API
    
    App->>GW: Tool call (with user JWT)
    GW->>GW: Extract userId from JWT
    GW->>GW: Check agent.required_credentials
    GW->>Vault: resolveCredentials(userId, types)
    
    alt Credentials found
        Vault-->>GW: Decrypted credentials
        GW->>MCP: Forward with injected creds
        MCP->>API: Call with credentials
        API-->>MCP: Response
        MCP-->>GW: Result
        GW-->>App: Tool result
    else Credentials missing
        Vault-->>GW: Missing: [serviceType]
        GW-->>App: { needsAuth: true, serviceType, authUrl }
    end
```



## Credential Flow: Local Tools (SDK-Based)

```mermaid
sequenceDiagram
    participant User as User
    participant App as Any App
    participant Action as Local Tool
    participant SDK as @simplaix/credential-sdk
    participant GW as Gateway API
    participant Vault as Credential Vault
    participant ExtAPI as External API
    
    User->>App: "Create a task"
    App->>Action: Execute action (with userToken)
    Action->>SDK: client.resolve(["gateway_api"])
    SDK->>GW: POST /credentials/resolve
    GW->>Vault: resolveCredentials(userId, types)
    
    alt Credentials found
        Vault-->>GW: Decrypted credential
        GW-->>SDK: { credentials: { gateway_api: token } }
        SDK-->>Action: Credential result
        Action->>ExtAPI: Call with credential
        ExtAPI-->>Action: Response
        Action-->>App: Tool result
    else Credentials missing
        Vault-->>GW: Missing
        GW-->>SDK: { missing: ["gateway_api"], authUrls: {...} }
        SDK-->>Action: Needs auth
        Action-->>App: { needsAuth: true, authUrl }
        App->>User: Show "Connect Gateway API" button
    end
```



## Gateway API Credential Provider Implementation

For the first implementation, create a "Gateway API" credential provider:

- `serviceType`: `gateway_api`
- `authType`: `jwt`
- Users can store their Gateway JWT token
- When MCP tools call Gateway APIs, the stored JWT is injected as `Authorization: Bearer <token>`

## Configuration

Add to [src/config.ts](src/config.ts):

- `CREDENTIAL_ENCRYPTION_KEY` - 32-byte hex key for AES-256-GCM
- `OAUTH_CALLBACK_BASE_URL` - Base URL for OAuth callbacks

## Key Files to Create/Modify

**Backend (Gateway Core):**

- `src/db/schema.ts` - Add `credential_providers`, `user_credentials` tables; add `required_credentials` to agents
- `src/services/encryption.service.ts` - Create AES-256-GCM encryption/decryption
- `src/services/credential-provider.service.ts` - Create credential provider CRUD
- `src/services/credential.service.ts` - Create user credential management
- `src/routes/credentials.ts` - Create user credential API endpoints
- `src/routes/credential-providers.ts` - Create admin credential provider endpoints
- `src/services/mcp-proxy.service.ts` - Modify to add credential resolution and injection for MCP tools
- `src/routes/admin.ts` - Modify to support `required_credentials` in agent registration
- `src/index.ts` - Modify to mount new routes
- `src/config.ts` - Modify to add encryption key config
- `src/types/index.ts` - Modify to add credential-related types

**Credential SDK Package (For Local Tools):**

- `packages/credential-sdk/package.json` - Package config (`@simplaix/credential-sdk`)
- `packages/credential-sdk/src/index.ts` - Main exports
- `packages/credential-sdk/src/client.ts` - CredentialClient class
- `packages/credential-sdk/src/types.ts` - Type definitions
- `packages/credential-sdk/src/errors.ts` - Custom error classes
- `pnpm-workspace.yaml` - Add `packages/*` to workspace

