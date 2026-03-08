<p align="center">
  <img src="docs/public/simplaix-gateway-logo.png" alt="Simplaix Gateway" width="128" />
</p>

# Agent Gateway by Simplaix

An open-source Agent Gateway that gives your AI agents a secure foundation — identity, credentials, policy enforcement, and observability — so you can deploy agents to production with confidence.

## Why Simplaix Gateway?

AI agents are increasingly autonomous — they call APIs, access sensitive data, and take real-world actions on behalf of users. But most agent frameworks lack the infrastructure to do this safely:

Simplaix Gateway is the infrastructure layer that answers all of these questions.

| Question | The gap |
|----------|---------|
| **Who is this agent?** | Agents have no standard identity or authentication model. Any request claiming to be an agent is trusted implicitly. |
| **What is it allowed to do?** | There is no fine-grained access control over which tools and APIs an agent can invoke on behalf of which user. |
| **Did anyone approve this?** | High-risk operations — deleting data, sending messages, moving money — execute silently with no human checkpoint. |
| **What actually happened?** | When something goes wrong, there is no structured record of ***who asked which agent to do what, and when***. |

Simplaix Gateway sits between your agents and the outside world, solving all of these problems in one layer.

## Key Features

- **Agent Identity** — Register agents with runtime tokens, kill switches, and tenant isolation
- **Multi-Protocol Routing** — Route to any HTTP agent runtime: MCP servers, or custom endpoints
- **MCP Proxy with ACL** — Provider-based tool routing with access control and policy enforcement
- **Credential Vault** — Encrypted per-user credential storage with automatic injection into agent requests
- **Policy Engine** — Allow, deny, or require human confirmation per tool, with risk-level classification
- **Human-in-the-Loop** — SSE-based real-time confirmation workflow for sensitive operations
- **Audit Trail** — Every tool call logged with agent ID, end-user ID, timing, and full context
- **Multi-Tenancy** — Tenant isolation across agents, credentials, users, and policies

## Architecture

```mermaid
flowchart TB
    subgraph clients [Clients]
        FE[Dashboard]
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
            DB[(SQLite / PostgreSQL)]
        end

        subgraph realtime [Real-time]
            SSE[SSE Stream]
        end
    end

    subgraph upstreams [Upstream Agent Runtimes]
        MCP1[MCP Server]
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
    HeaderInjector --> Custom

    AgentSvc --> DB
    AuditSvc --> DB
    CredProviders --> DB
    ToolProviders --> DB

    SSE --> FE
```

## Quick Start (Local Mode)

Run the gateway locally with **no Docker or PostgreSQL required** — it uses SQLite by default.

### Prerequisites

- Node.js 20+

### 1. Install

```bash
npm install -g @simplaix/simplaix-gateway
```

### 2. Initialise a workspace

```bash
mkdir my-gateway && cd my-gateway
gateway init
```

`gateway init` creates a `.env` file with auto-generated secrets:

```bash
DATABASE_URL=file:~/.simplaix-gateway/data/gateway.db
PORT=7521
JWT_SECRET=<generated>
CREDENTIAL_ENCRYPTION_KEY=<generated>
```

### 3. Start

```bash
gateway start
```

The gateway starts on `http://localhost:7521`. SQLite migrations are applied automatically.

### 4. Create an admin user

```bash
gateway admin create --email admin@example.com --password secret
```

```bash
# Verify
curl http://localhost:7521/api/health
```

### 5. Optional: expose via public tunnel

```bash
gateway start --tunnel
# [Tunnel] Public URL: https://xxxx.trycloudflare.com
```

### 6. Optional: start the dashboard + agent

Run from the repo root (requires the `gateway-app/` directory):

```bash
gateway start --dashboard
# or all-in-one:
gateway start --tunnel --dashboard
```

This starts:
- **Gateway** (Hono) on port 3001
- **Cloudflared quick tunnel** → prints a public `https://` URL, sets it as `GATEWAY_PUBLIC_URL`
- **Dashboard** (`gateway-app/`) on port 3000 via Next.js
- **Python agent** (`gateway-app/agent/`) on port 8000 via `uv`

### CLI Reference

```bash
gateway --version
gateway --help

gateway init [--force]                       # scaffold .env
gateway start [--port <n>] [--db <url>]      # start server
            [--tunnel]                       # + cloudflared public tunnel
            [--dashboard]                    # + Next.js dashboard + Python agent
            [--dashboard-path <dir>]         # custom path to gateway-app/
gateway status                               # check DB + config
gateway admin create --email <> --password <> [--name <>]
gateway admin list
```

---

## Development Setup

For contributors who work directly in the repo. Supports two modes:

- **Source mode** — run the CLI with `tsx` directly from `src/`, no build step needed
- **Package mode** — build to `dist/` and test as the real npm package via `npm link`

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 17+ (only if using Postgres; SQLite works out of the box)
- Python 3.12+ (for the agent)

### 1. Clone and install

```bash
git clone https://github.com/simplaix/simplaix-gateway.git
cd simplaix-gateway
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET, DATABASE_URL (leave as file:~/.simplaix-gateway/data/gateway.db for SQLite)
```

### 3. Run in source mode (recommended for development)

Use `pnpm dev:cli` to run any CLI command directly from TypeScript source via `tsx` — no build step:

```bash
pnpm dev:cli -- start                        # start gateway (SQLite)
pnpm dev:cli -- start --tunnel               # + cloudflared tunnel
pnpm dev:cli -- start --tunnel --dashboard   # + dashboard + agent
pnpm dev:cli -- init
pnpm dev:cli -- status
pnpm dev:cli -- admin create --email admin@example.com --password secret
pnpm dev:cli -- admin list
```

> The `--` separates pnpm flags from CLI arguments.

### 4. Test as npm package (package mode)

Build the CLI and link it globally to verify the published package behaviour:

```bash
pnpm build:cli     # compiles src/ → dist/
npm link           # registers the `gateway` binary from dist/
```

Then use it exactly as end-users would:

```bash
gateway start --tunnel --dashboard
gateway admin list
gateway --version
```

To unlink when done:

```bash
npm unlink -g simplaix-gateway
```

### 5. Use PostgreSQL instead of SQLite

```bash
# In .env:
DATABASE_URL=postgres://user:password@localhost:5432/gateway

# Start Postgres
docker compose up -d postgres

# Apply migrations
pnpm db:migrate

# Start
pnpm dev:cli -- start
```

### 6. Start the dashboard standalone (optional)

```bash
cd gateway-app
pnpm dev   # starts Next.js UI + Python agent via concurrently
```

## Project Structure

```
simplaix-gateway/
  src/                          # Gateway API (Hono)
    cli/                        # CLI entry + commands
    routes/                     # Route modules
    services/                   # Domain services
    middleware/                  # Auth, policy, audit middleware
    db/                         # Drizzle schema + migrations
  gateway-app/                  # Next.js dashboard + Python agent
  drizzle/                      # Migration files (pg + sqlite)
  docs/                         # Documentation site (Fumadocs)
  packages/
    credential-sdk-python/      # Python credential SDK
```

## Documentation

Full documentation is available in the `docs/` directory. To run locally:

```bash
pnpm --filter docs dev
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[Apache 2.0](LICENSE)
