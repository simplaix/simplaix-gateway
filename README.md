# Simplaix Gateway

An enterprise-grade Agent Gateway that provides identity, security, credential management, and policy enforcement for AI agents. It supports multiple agent protocols including MCP, CopilotKit, AG-UI/Strands, and any HTTP-based agent runtime.

## Key Features

- **Multi-Protocol Agent Routing** -- Route requests to any HTTP-based agent runtime (MCP servers, CopilotKit agents, Strands/AG-UI agents, custom runtimes)
- **Virtual Agent Identity** -- Register agents with upstream URLs, runtime tokens, kill switch, and tenant isolation
- **Three-Layer Authentication** -- JWT (issued by gateway-app, verified by gateway core), API Keys (`gk_`) for gateway-to-client-app, Agent Runtime Tokens (`art_`) for agent identity
- **MCP Proxy with ACL** -- Provider-based tool routing with access control, policy enforcement, and audit logging
- **Credential Vault** -- Encrypted per-user credential storage with automatic resolution and injection
- **Policy Engine** -- Configurable rules: allow, deny, or require human confirmation per tool
- **Human-in-the-Loop Confirmation** -- SSE-based real-time confirmation workflow for sensitive operations
- **Comprehensive Audit Trail** -- Track every tool call with full context, agent ID, end-user ID, and timing
- **Multi-Tenancy** -- Tenant isolation across agents, credentials, and users
- **Credential SDK** -- Python SDK (`simplaix-gateway`) for MCP transport, user context propagation, and credential resolution

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 17+ (or Docker)
- Python 3.12+ (for the agent)

### Option A: Docker Compose (recommended)

```bash
# Copy environment template
cp .env.example .env

# Start Gateway + PostgreSQL
docker compose up -d

# Health check
curl http://localhost:3001/api/health
```

### Option B: Local Development

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Start PostgreSQL (via Docker or locally)
docker compose up -d postgres

# Apply migrations
pnpm db:migrate

# Start the Gateway server (serverless-style dev)
pnpm dev
# Or use long-running mode (faster local iteration)
# pnpm dev:server

# Start dashboard UI (in another terminal)
pnpm --filter simplaix-gateway-app dev:ui

# Start the Python agent (in another terminal, from repo root)
cd gateway-app/agent && uv sync && uv run main.py

# Start the docs site (in another terminal)
pnpm --filter docs dev
```

### Configuration

```bash
# Server
PORT=3001

# Gateway JWT verification
JWT_SECRET=your-secret-key
JWT_ISSUER=simplaix-gateway
JWT_AUDIENCE=simplaix-gateway

# Database (PostgreSQL)
DATABASE_URL=postgresql://gateway:gateway@localhost:5432/gateway

# Bootstrap admin (first startup)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme123

# Credential encryption (required in production, optional in local dev)
CREDENTIAL_ENCRYPTION_KEY=your-64-char-hex-key

# Default MCP server (fallback)
MCP_SERVER_URL=http://localhost:3001
```

## Supported Agent Protocols

| Protocol | Integration Point | Description |
|----------|------------------|-------------|
| **MCP** | `/api/v1/mcp-proxy/:providerId/mcp` | Streamable HTTP MCP proxy with policy enforcement and ACL |
| **HTTP Agent** | `/api/v1/agents/:id/invoke` | Any HTTP-based agent runtime (JSON or SSE streaming) |
| **CopilotKit** | Via agent invoke | CopilotKit agents with AG-UI SSE streaming |
| **Strands / AG-UI** | Via agent invoke | Strands framework agents with AG-UI protocol |

## System Architecture

```mermaid
flowchart TB
    subgraph clients [Clients]
        FE[Dashboard / CopilotKit]
        AI[AI Agent Runtime]
        SDK[Credential SDK]
    end

    subgraph gateway [Simplaix Gateway]
        direction TB

        subgraph auth [Authentication Layer]
            AuthMW[Auth Middleware]
            JWT[JWT Verifier]
            APIKeyAuth[API Key Auth]
            ART[Runtime Token Auth]
        end

        subgraph core [Core Services]
            Policy[Policy Engine]
            Pauser[Request Pauser]
            AgentSvc[Agent Service]
            CredSvc[Credential Service]
            CredProviders[Credential Providers]
            ToolProviders[Tool Providers + ACL]
        end

        subgraph proxy [Proxy Layer]
            MCPProxy[MCP Proxy]
            AgentInvoke[Agent Invoke]
            HeaderInjector[Identity + Credential Injector]
        end

        subgraph data [Data Layer]
            AuditSvc[Audit Service]
            Encryption[AES-256-GCM Encryption]
            DB[(PostgreSQL)]
        end

        subgraph realtime [Real-time]
            SSE[SSE Stream]
        end
    end

    subgraph upstreams [Upstream Agent Runtimes]
        MCP1[MCP Server]
        CK[CopilotKit Agent]
        Strands[Strands / AG-UI Agent]
        Custom[Custom HTTP Agent]
    end

    FE -->|JWT| AuthMW
    AI -->|art_ token| ART
    SDK -->|gk_ API key| APIKeyAuth

    AuthMW --> JWT
    APIKeyAuth --> CredSvc
    ART --> ToolProviders

    JWT --> Policy
    APIKeyAuth --> Policy
    ART --> Policy
    Policy --> Pauser
    Pauser --> MCPProxy

    AgentInvoke --> CredSvc
    CredSvc --> Encryption
    Encryption --> DB

    MCPProxy --> HeaderInjector
    AgentInvoke --> HeaderInjector
    HeaderInjector --> MCP1
    HeaderInjector --> CK
    HeaderInjector --> Strands
    HeaderInjector --> Custom

    AgentSvc --> DB
    AuditSvc --> DB
    CredProviders --> DB
    ToolProviders --> DB

    SSE --> FE
```

## Authentication Model

The Gateway supports three authentication methods:

| Method | Format | Use Case |
|--------|--------|----------|
| **JWT** | `Authorization: Bearer <jwt>` | Admin operations, agent invocation from frontend |
| **API Key** | `X-Api-Key: gk_xxx` + `X-User-Id` | Server-to-server (tool proxy, credential resolution) |
| **Agent Runtime Token** | `Authorization: Bearer art_xxx` | Agent identity for MCP proxy calls |

### JWT Authentication

Platform users (admins, agent creators) log in via **gateway-app**, which issues JWTs. Gateway core only **verifies** tokens — it never issues user-facing JWTs. The gateway also verifies external JWTs (e.g., Auth0, Azure AD) via JWKS for end-user authentication.

```bash
# Login via gateway-app (issues JWT)
POST /api/auth/login          # gateway-app local route
{ "email": "admin@example.com", "password": "..." }
# Returns: { "token": "eyJ...", "user": { ... } }

# Verify credentials (gateway core internal — used by gateway-app)
POST /api/v1/auth/verify-credentials
{ "email": "admin@example.com", "password": "..." }
# Returns: { "user": { ... } }  (no token — signing is gateway-app's job)
```

### API Keys

Gateway API Keys (`gk_`) provide server-to-server trust. They are used by agent runtimes to call back into the Gateway for credential resolution. They support scoped access (`credentials:resolve`, `credentials:read`, `credentials:write`).

```bash
# Create API key (admin)
POST /api/v1/admin/api-keys
{ "name": "Agent Server", "scopes": ["credentials:resolve"] }
# Returns: { "key": "gk_xxx...", ... }
```

### Agent Runtime Tokens

Each agent receives a Runtime Token (`art_xxx`) upon creation. This token serves as the agent's identity card for authenticating with the Gateway's MCP Proxy. It is shown only once at creation time and can be regenerated if compromised.

```bash
# Token is returned when creating an agent
POST /api/v1/admin/agents
# Returns: { "agent": { ... }, "runtime_token": "art_xxx..." }

# Regenerate (invalidates old token)
POST /api/v1/admin/agents/:id/regenerate-token
# Returns: { "runtime_token": "art_newToken..." }
```

## MCP Proxy

The Gateway provides a provider-based MCP proxy that routes tool calls to upstream MCP servers. Each tool provider defines a pattern (e.g., `slack_*`) and an upstream endpoint. The proxy enforces access control, policies, and audit logging.

### Tool Providers

Admins register tool providers that define routing rules:

```bash
POST /api/v1/admin/tool-providers
{
  "name": "Slack Integration",
  "pattern": "slack_*",
  "endpoint": "http://slack-mcp-server:3000",
  "authType": "bearer",
  "authSecret": "upstream-secret",
  "priority": 10
}
# Returns: { "provider": { "id": "provider-123", ... } }
```

### Provider Access Control

Access to tool providers is controlled via ACL rules:

```bash
# Create an access rule (user/agent scoped)
POST /api/v1/admin/provider-access
{
  "subjectType": "agent",
  "subjectId": "agent-123",
  "providerId": "provider-123",
  "action": "allow",
  "toolPattern": "*"
}

# List rules for a provider
GET /api/v1/admin/provider-access/by-provider/:providerId
```

### Request Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Agent Runtime
    participant GW as Gateway
    participant Auth as Auth Middleware
    participant ACL as ACL Check
    participant PE as Policy Engine
    participant RP as Request Pauser
    participant SSE as SSE Stream
    participant U as Confirmer
    participant Audit as Audit Service
    participant MCP as Upstream MCP

    C->>GW: POST /api/v1/mcp-proxy/:providerId/mcp<br/>Authorization: Bearer art_xxx
    GW->>Auth: Authenticate (Runtime Token)
    Auth-->>GW: Agent context

    GW->>ACL: Check provider access
    ACL-->>GW: Allowed

    GW->>PE: Evaluate policy for tool
    PE-->>GW: allow / deny / require_confirmation

    alt Policy: deny
        GW-->>C: 403 Forbidden
    else Policy: require_confirmation
        GW->>RP: Pause request
        RP->>SSE: Emit CONFIRMATION_REQUIRED
        SSE->>U: Show decision card
        U->>GW: POST /api/v1/confirmation/:id/confirm
        GW->>RP: Resume
    end

    GW->>Audit: Create log (pending)
    GW->>MCP: Forward + identity headers
    MCP-->>GW: Response
    GW->>Audit: Update log (completed)
    GW-->>C: Response
```

### Endpoints

```bash
# MCP proxy (Streamable HTTP)
POST   /api/v1/mcp-proxy/:providerId/mcp
GET    /api/v1/mcp-proxy/:providerId/mcp   # SSE session resumption
DELETE /api/v1/mcp-proxy/:providerId/mcp   # Session termination
```

## Credential Vault

The Gateway provides an encrypted credential vault that stores per-user credentials (OAuth tokens, API keys, JWTs) and makes them available to agents at runtime.

### How It Works

```mermaid
sequenceDiagram
    participant User as User
    participant FE as Frontend
    participant GW as Gateway
    participant Vault as Credential Vault
    participant Agent as Agent Runtime

    Note over User,Agent: 1. User connects a service
    User->>FE: Click "Connect Gateway API"
    FE->>GW: POST /api/v1/credentials/jwt
    GW->>Vault: Store encrypted credential

    Note over User,Agent: 2. User chats with agent
    User->>FE: "Show me all agents"
    FE->>GW: POST /api/v1/agents/:id/invoke + JWT

    Note over GW: 3. Gateway pre-checks credentials
    GW->>Vault: Resolve requiredCredentials
    Vault-->>GW: Credentials available

    Note over GW: 4. Gateway injects credentials as headers
    GW->>Agent: Forward + X-Credential-gateway_api header
    Agent->>Agent: SDK reads credential from header
    Agent-->>GW: Response
    GW-->>FE: Stream response to chat
```

### Credential Providers

Admins configure credential providers that define how each credential type works:

```bash
POST /api/v1/credential-providers
{
  "name": "Gateway API",
  "serviceType": "gateway_api",
  "authType": "jwt",
  "config": {
    "connectUrl": "/auth/connect?service=gateway_api",
    "jwt": { "headerName": "Authorization", "prefix": "Bearer " }
  }
}
```

Supported auth types: `oauth2`, `api_key`, `jwt`, `basic`.

### Credential Resolution

Agents declare `requiredCredentials` in their configuration. The Gateway resolves these before forwarding requests:

- **Agent invoke route** (`/api/v1/agents/:id/invoke`): Pre-checks credentials. Returns `CREDENTIALS_REQUIRED` if missing, or injects `X-Credential-*` headers if available.
- **MCP proxy** (`/api/v1/mcp-proxy/:providerId/mcp`): Same pattern -- resolves and injects credentials into upstream headers.

### Credential SDK

The Python SDK lets agent code access credentials transparently:

```python
from simplaix_gateway.credentials import create_credential_client

client = create_credential_client(gateway_api_url="http://localhost:3001")

# When running behind the Gateway, credentials arrive via headers -- zero network calls
token = await client.get_credential("gateway_api")

# The SDK also provides Starlette middleware for automatic context setup
app.add_middleware(client.starlette_middleware())
```

The SDK checks injected credentials from Gateway headers first, then falls back to the Gateway API.

## Agent Invocation

The agent invoke endpoint is protocol-agnostic -- it forwards requests to any HTTP-based agent runtime and supports both JSON and SSE streaming responses.

When the Gateway invokes an agent (via `/api/v1/agents/:id/invoke`), it performs a full pre-flight:

1. **Authenticate** the user via JWT
2. **Load agent** and check tenant isolation + kill switch
3. **Resolve credentials** -- if `requiredCredentials` are configured and any are missing, return 401 with auth URLs
4. **Inject headers** -- user identity + resolved credentials as `X-Credential-*`
5. **Forward** to the agent's `upstreamUrl` and stream the response back

```bash
# Invoke an agent (frontend -> Gateway -> agent runtime)
POST /api/v1/agents/:agentId/invoke
Authorization: Bearer <user-jwt>

# Pre-check credentials without invoking
GET /api/v1/agents/:agentId/credentials-check
Authorization: Bearer <user-jwt>
```

### Headers Injected to Agent Runtime

```
X-User-Id: <user-id>
X-End-User-ID: <user-id>
X-End-User-Email: user@example.com
X-End-User-Roles: admin,user
X-Tenant-ID: <tenant-id>
X-Gateway-Agent-ID: <agent-uuid>
X-Gateway-Request-ID: <request-id>
X-Credential-gateway_api: <resolved-token>
X-Credential-slack: <resolved-token>
```

## Agent Management

```bash
# Register a new agent (returns runtime token)
POST /api/v1/admin/agents
{
  "name": "Finance Bot",
  "upstreamUrl": "https://finance-agent.internal/mcp",
  "requiredCredentials": [{ "serviceType": "gateway_api" }],
  "description": "Handles financial queries"
}

# List agents
GET /api/v1/admin/agents

# Get / Update / Delete
GET    /api/v1/admin/agents/:id
PUT    /api/v1/admin/agents/:id
DELETE /api/v1/admin/agents/:id

# Kill switch
POST /api/v1/admin/agents/:id/disable
POST /api/v1/admin/agents/:id/enable

# Regenerate runtime token
POST /api/v1/admin/agents/:id/regenerate-token
```

## Policy Engine

Policies are configured in `src/config.ts`:

```typescript
const policies = [
  { tool: 'transfer_money', action: 'require_confirmation', risk: 'high' },
  { tool: 'delete_*',       action: 'require_confirmation', risk: 'critical' },
  { tool: 'read_*',         action: 'allow',               risk: 'low' },
];
```

| Action | Behavior |
|--------|----------|
| `allow` | Proceeds immediately |
| `deny` | Blocked with 403 |
| `require_confirmation` | Pauses until a human confirms via SSE |

| Risk Level | Description |
|------------|-------------|
| `low` | Read-only operations |
| `medium` | Write operations |
| `high` | Financial or sensitive operations |
| `critical` | Destructive operations |

## Confirmation Flow

```bash
# SSE stream for real-time notifications
GET /api/v1/stream

# Polling fallback
GET /api/v1/stream/pending

# Respond to confirmation
POST /api/v1/confirmation/:id/confirm
POST /api/v1/confirmation/:id/reject
POST /api/v1/confirmation/:id/respond
{ "confirmed": true, "reason": "Looks good" }
```

## Audit Logs

```bash
# Query logs (filtered)
GET /api/v1/audit/logs?userId=xxx&agentId=xxx&toolName=xxx&status=completed&limit=50

# Get single log
GET /api/v1/audit/logs/:id

# Statistics (admin)
GET /api/v1/audit/stats
```

## Database Schema

```mermaid
erDiagram
    users {
        text id PK
        text email UK
        text name
        text password_hash
        text tenant_id
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    user_roles {
        text id PK
        text user_id FK
        text role
        timestamp created_at
    }

    agents {
        text id PK
        text name
        text upstream_url
        text upstream_secret
        text runtime_token_hash
        text runtime_token_prefix
        boolean is_active
        boolean require_confirmation
        text required_credentials "JSON array"
        text tenant_id FK
        text owner_user_id FK
        text description
        timestamp created_at
        timestamp updated_at
    }

    tool_providers {
        text id PK
        text name
        text pattern "glob e.g. slack_*"
        text endpoint
        text auth_type "none/bearer/api_key"
        text auth_secret
        boolean is_active
        integer priority
        text description
        text tenant_id
        timestamp created_at
        timestamp updated_at
    }

    provider_access_rules {
        text id PK
        text subject_type "user/agent"
        text subject_id FK
        text provider_id FK
        text action "allow/deny/require_confirmation"
        text tool_pattern "default: *"
        text confirmation_mode "always/never"
        text risk_level
        text description
        text tenant_id
        timestamp created_at
        timestamp updated_at
    }

    credential_providers {
        text id PK
        text name
        text service_type
        text auth_type "oauth2/api_key/jwt/basic"
        text config "JSON"
        text description
        boolean is_active
        text tenant_id
        timestamp created_at
        timestamp updated_at
    }

    user_credentials {
        text id PK
        text user_id FK
        text provider_id FK
        text credentials "AES-256-GCM encrypted"
        text scopes
        text refresh_token "Encrypted"
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }

    api_keys {
        text id PK
        text key_hash "SHA-256"
        text key_prefix "gk_xxxx"
        text name
        text scopes "JSON array"
        text created_by FK
        text tenant_id
        boolean is_active
        timestamp created_at
        timestamp expires_at
        timestamp last_used_at
    }

    audit_logs {
        text id PK
        text user_id
        text tenant_id
        text agent_id
        text end_user_id
        text provider_id
        text tool_name
        text arguments "JSON"
        text result "JSON"
        text confirmation_id FK
        text confirmed_by
        text status "pending/confirmed/rejected/completed/failed"
        integer duration "ms"
        timestamp created_at
        timestamp completed_at
    }

    confirmations {
        text id PK
        text request_id
        text user_id
        text tenant_id
        text tool_name
        text arguments "JSON"
        text risk "low/medium/high/critical"
        text status "pending/confirmed/rejected/expired/consumed"
        text confirmed_by
        text reason
        text provider_id FK
        text agent_id FK
        text end_user_id
        text rule_id FK
        text confirmation_token
        timestamp token_expires_at
        timestamp created_at
        timestamp resolved_at
    }

    users ||--o{ user_roles : "has roles"
    users ||--o{ agents : owns
    tool_providers ||--o{ provider_access_rules : "governed by"
    credential_providers ||--o{ user_credentials : "defines type"
    users ||--o{ user_credentials : "has many"
    agents ||--o{ audit_logs : generates
    confirmations ||--o| audit_logs : "linked to"
```

## Project Structure

```
simplaix-gateway/
  src/                          # Gateway API (Hono)
    routes/                     # Route modules (admin, agent, mcp, auth, ...)
    services/                   # Domain services (auth, policy, audit, provider access, ...)
    middleware/                 # Auth, policy, request/audit middleware
    db/                         # Drizzle schema + DB bootstrap
    modules/                    # Shared domain modules (authz, providers)
  gateway-app/                  # Next.js dashboard + embedded Python agent
    src/                        # Frontend app
    agent/                      # Python runtime used by the dashboard
  simplaix-approval-app/        # Expo mobile approval app
  docs/                         # Public docs site
  packages/
    simplaix-gateway-py/        # Python SDK (`simplaix-gateway`)
    lobster-shell/              # Shell/client integration package
  scripts/                      # Local tooling scripts
  data/                         # Seed/demo data
```
