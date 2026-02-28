# lobster-shell

Lobster Shell plugin for [Simplaix Gateway](../../README.md) &mdash; **tool policy evaluation**, **audit logging**, and **mobile approval pairing**.

Every tool call made by a Lobster Shell agent is intercepted:

1. **Before execution** &mdash; the plugin calls the Gateway's `/api/v1/tool-gate/evaluate` endpoint to check policy. The Gateway may `allow`, `deny`, or `require_confirmation` (human-in-the-loop approval). Denied or rejected calls are blocked before the tool runs.
2. **After execution** &mdash; the plugin calls `/api/v1/tool-gate/audit` to update the audit record with the tool's result, error status, and execution duration.

The plugin also registers a `/pair` command that generates a deep link for connecting the Simplaix mobile approval app.

If the Gateway is unreachable, the plugin **fails open** (tool calls proceed with a warning log).

## Quick start (full autonomous setup)

This section describes every step needed to go from zero to a working Gateway + plugin setup.

### 1. Start PostgreSQL

```bash
cd <gateway-root>          # the simplaix-gateway repo root
docker compose up -d postgres
```

This starts PostgreSQL 17 on port 5432 with default credentials (`gateway`/`gateway`/`gateway`). Wait a few seconds for the health check to pass.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` &mdash; the minimum required values are:

```bash
JWT_SECRET=<any-random-string>        # shared with gateway-app
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<choose-a-password>
DATABASE_URL=postgresql://gateway:gateway@localhost:5432/gateway
PORT=3001
```

All other values have sensible defaults. See `.env.example` for the full list.

### 3. Install dependencies & run migrations

```bash
pnpm install
pnpm db:migrate
```

Migrations are in `drizzle/` and managed by Drizzle Kit.

### 4. Start the gateway

```bash
pnpm dev:server
```

On first startup the gateway automatically:
- Seeds a built-in `gateway_api` credential provider
- Creates the initial admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`

Verify with:

```bash
curl http://localhost:3001/api/health
# {"status":"healthy", ...}
```

### 5. Obtain an admin JWT

JWTs are issued by `gateway-app` (the Next.js dashboard), not by the core gateway. Two options:

**Option A &mdash; via gateway-app (recommended)**

```bash
cd gateway-app
cp .env.example .env
# Set JWT_SECRET and JWT_ISSUER to the same values as the core gateway .env
pnpm dev   # starts on port 3000 by default
```

Then call its login endpoint:

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<your-password>"}' \
  | jq -r '.token'
```

**Option B &mdash; sign a JWT manually (dev only)**

Use the same `JWT_SECRET` and `JWT_ISSUER` from `.env` to sign a HS256 JWT with payload `{ sub: "<user-id>", roles: ["admin"], iss: "simplaix-gateway" }`. The user ID is printed in the gateway startup log (`Created user: <id>`).

Store the token for subsequent steps:

```bash
ADMIN_JWT="<token-from-above>"
```

### 6. Register an agent

```bash
curl -s -X POST http://localhost:3001/api/v1/admin/agents \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-lobster-agent",
    "description": "Lobster Shell agent with policy enforcement"
  }' | jq .
```

Response (the `runtime_token` is shown **once**):

```json
{
  "success": true,
  "agent": { "id": "agent_abc123", "name": "my-lobster-agent", ... },
  "runtime_token": "art_EkQ2x1z9vL4pMwN5jHsD..."
}
```

Save the `runtime_token` &mdash; it is the agent's identity credential.

### 7. Seed tool policies

```bash
ADMIN_JWT="$ADMIN_JWT" AGENT_ID="agent_abc123" bash seed-openclaw-policies.sh
```

This creates per-tool policy rules (24 rules for built-in tools). The script auto-creates a virtual tool provider and prints the `PROVIDER_ID`.

### 8. Install & configure the plugin

Add the plugin path to `~/.lobster-shell/lobster-shell.json`:

```jsonc
{
  "plugins": {
    "load": {
      "paths": [
        "/path/to/simplaix-gateway/packages/lobster-shell"
      ]
    },
    "entries": {
      "lobster-shell": {
        "enabled": true,
        "config": {
          "gatewayUrl": "http://localhost:3001",
          "providerId": "<PROVIDER_ID from step 7>",
          "timeoutMs": 310000,
          "skipTools": []
        }
      }
    }
  }
}
```

Set the runtime token as an environment variable:

```jsonc
// in lobster-shell.json
{
  "env": {
    "vars": {
      "SIMPLAIX_AGENT_RUNTIME_TOKEN": "art_EkQ2x1z9vL4pMwN5jHsD..."
    }
  }
}
```

Or export it in your shell:

```bash
export SIMPLAIX_AGENT_RUNTIME_TOKEN="art_EkQ2x1z9vL4pMwN5jHsD..."
```

### 9. (Optional) Cloudflare tunnel for public URLs

For the `/pair` deep links to be clickable in WhatsApp/Telegram, the gateway needs a public HTTPS URL:

```bash
./scripts/dev-tunnel.sh    # starts cloudflared, writes GATEWAY_PUBLIC_URL to .env
```

Then restart the gateway (`pnpm dev:server`) so it picks up the new URL.

### 10. Verify

Restart Lobster Shell. You should see:

```
[simplaix-gateway] Policy & Audit plugin initialized
```

Trigger any tool call and confirm:
1. A `pending` audit record is created (from `evaluate`)
2. The record is updated to `completed` with result and duration (from `audit`)
3. High-risk tools trigger a confirmation request (push notification to paired devices)

## Configuration reference

### Plugin config (lobster-shell.json)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gatewayUrl` | `string` | *required* | Simplaix Gateway base URL (e.g. `http://localhost:3001`) |
| `providerId` | `string` | `"lobster-shell"` | Provider ID sent to Gateway for policy evaluation |
| `timeoutMs` | `number` | `310000` | HTTP timeout (ms) for the evaluate endpoint. Should be slightly longer than the Gateway's internal confirmation timeout (5 min). |
| `skipTools` | `string[]` | `[]` | Tool names to skip entirely (no policy check, no audit) |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIMPLAIX_AGENT_RUNTIME_TOKEN` | Yes | Agent runtime token (`art_xxx`) from step 6 |
| `SIMPLAIX_GATEWAY_URL` | No | Alternative to `gatewayUrl` in config |

### Gateway environment (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | &mdash; | Shared secret for JWT verification (must match gateway-app) |
| `ADMIN_EMAIL` | Yes | &mdash; | Initial admin user email |
| `ADMIN_PASSWORD` | Yes | &mdash; | Initial admin user password |
| `DATABASE_URL` | Yes | &mdash; | PostgreSQL connection string |
| `PORT` | No | `3000` | Gateway HTTP port |
| `JWT_ISSUER` | No | `simplaix-gateway` | JWT issuer claim |
| `JWT_AUDIENCE` | No | &mdash; | JWT audience claim |
| `GATEWAY_PUBLIC_URL` | No | `http://localhost:$PORT` | Public URL for pairing deep links |
| `EXPO_ACCESS_TOKEN` | No | &mdash; | Expo token for push notifications |

## How it works

### Policy evaluation flow

```
Agent calls tool
       |
       v
  before_tool_call hook
       |
       v
  POST /api/v1/tool-gate/evaluate
       |
       +---> allow       --> tool executes normally
       +---> confirmed   --> tool executes (human approved)
       +---> denied      --> tool BLOCKED (policy violation)
       +---> rejected    --> tool BLOCKED (human rejected)
       +---> timeout     --> tool BLOCKED (approval timed out)
       +---> unreachable --> tool executes (fail-open)
```

### Audit logging flow

```
Tool execution completes
       |
       v
  after_tool_call hook
       |
       v
  POST /api/v1/tool-gate/audit  (fire-and-forget)
       |
       +---> Updates the pending audit record with:
             - result (tool output or error)
             - durationMs (execution time)
             - status (completed / failed)
```

### Pairing flow (/pair command)

```
User sends /pair in WhatsApp/Telegram
       |
       v
  Plugin calls POST /api/v1/auth/pairing-code
       |
       v
  Gateway returns { token, deepLink }
       |
       v
  Bot replies with deep link (https://xxx.trycloudflare.com/api/v1/auth/pair-link/AbC12x3k)
       |
       v
  User taps link --> HTML page redirects to simplaixapprovalapp://pair?g=...&t=...
       |
       v
  Mobile app opens, calls POST /api/v1/auth/pair
       |
       v
  Device registered for push notifications, receives long-lived device token
```

### Agent identity

The plugin does **not** send `agentId` in request bodies. Instead, the Gateway resolves the agent identity from the `art_xxx` token (sent as `Authorization: Bearer art_xxx`). This ensures the audit log always uses the correct agent registered in the Gateway.

### Lobster Shell hook behavior notes

- Lobster Shell may call `register()` twice; the plugin guards against duplicate registration.
- Lobster Shell fires `after_tool_call` twice per tool execution: the first invocation carries the result but no `durationMs`, the second carries both. The plugin only sends the audit on the second (complete) invocation.
- The `after_tool_call` context does not include `sessionKey`, so the plugin uses `toolName` as the correlation key between `before_tool_call` and `after_tool_call`.

## Gateway admin API reference

All admin endpoints require a JWT with `admin` or `agent_creator` role.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/admin/agents` | Register a new agent (returns `runtime_token` once) |
| `GET` | `/api/v1/admin/agents` | List agents |
| `GET` | `/api/v1/admin/agents/:id` | Get agent details |
| `PUT` | `/api/v1/admin/agents/:id` | Update agent |
| `DELETE` | `/api/v1/admin/agents/:id` | Delete agent |
| `POST` | `/api/v1/admin/agents/:id/regenerate-token` | Regenerate runtime token |
| `POST` | `/api/v1/admin/agents/:id/disable` | Disable agent |
| `POST` | `/api/v1/admin/agents/:id/enable` | Enable agent |
| `POST` | `/api/v1/admin/api-keys` | Create API key (`gk_xxx`, returned once) |
| `GET` | `/api/v1/admin/api-keys` | List API keys |
| `DELETE` | `/api/v1/admin/api-keys/:id` | Revoke API key |

## Gateway scripts

| Script | Description |
|--------|-------------|
| `pnpm dev:server` | Start gateway (long-running, with hot reload) |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:generate` | Generate migrations from schema changes |
| `pnpm db:studio` | Open Drizzle Studio (DB explorer) |
| `pnpm typecheck:gateway` | TypeScript type checking |
| `pnpm test:gateway` | Run tests |
| `./scripts/dev-tunnel.sh` | Start Cloudflare tunnel, write `GATEWAY_PUBLIC_URL` to `.env` |
| `bash seed-openclaw-policies.sh` | Seed per-tool policy rules for an agent |

## Files

```
lobster-shell/
  package.json            # npm package metadata (@simplaix/lobster-shell)
  openclaw.plugin.json    # Lobster Shell plugin manifest (id, config schema, UI hints)
  index.ts                # Plugin entry point (before_tool_call + after_tool_call hooks, /pair command)
  README.md               # This file
```

## License

See the Simplaix Gateway repository license.
