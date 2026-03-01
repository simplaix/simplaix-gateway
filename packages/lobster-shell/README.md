# lobster-shell

OpenClaw plugin (`@simplaix/lobster-shell`) for [Simplaix Gateway](../../README.md) — **tool policy evaluation**, **audit logging**, and **mobile approval pairing**.

Every tool call made by an OpenClaw agent is intercepted:

1. **Before execution** — calls `/api/v1/tool-gate/evaluate` to check policy. The Gateway may `allow`, `deny`, or `require_confirmation` (human-in-the-loop). Denied or rejected calls are blocked before the tool runs.
2. **After execution** — calls `/api/v1/tool-gate/audit` to record the result, error status, and duration.

The plugin registers a `/pair` command that generates a deep link for the Simplaix mobile approval app. If the Gateway is unreachable, the plugin **fails open** (tool calls proceed with a warning).

## How it works

### Policy evaluation

```
Agent calls tool
       │
       ▼
  POST /api/v1/tool-gate/evaluate
       │
       ├─ allow       → tool executes
       ├─ confirmed   → tool executes (human approved)
       ├─ denied      → BLOCKED (policy violation)
       ├─ rejected    → BLOCKED (human rejected)
       ├─ timeout     → BLOCKED (approval timed out)
       └─ unreachable → tool executes (fail-open)
```

### Audit logging

```
Tool execution completes
       │
       ▼
  POST /api/v1/tool-gate/audit  (fire-and-forget)
       │
       └─ Updates pending record with result, durationMs, status
```

### Pairing (`/pair` command)

```
User sends /pair
  → Plugin calls POST /api/v1/auth/pairing-code
  → Gateway returns { token, deepLink }
  → User taps link → mobile app opens → device registered for push notifications
```

### Agent identity

The plugin sends the `art_xxx` token as `Authorization: Bearer art_xxx`. The Gateway resolves the agent identity from this token — no `agentId` is sent in request bodies.

## Setup

Follow these steps in order from a fresh clone.

### 1. Clone and start PostgreSQL

```bash
git clone https://github.com/simplaix/simplaix-gateway.git
cd simplaix-gateway
docker compose up -d postgres
```

### 2. Configure `.env`

```bash
cp .env.example .env
```

Minimum required values:

```bash
JWT_SECRET=<any-random-string>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<choose-a-password>
DATABASE_URL=postgresql://gateway:gateway@localhost:5432/gateway
PORT=3001
```

### 3. Install dependencies and migrate

```bash
pnpm install
pnpm db:migrate
```

### 4. Start the gateway server (port 3001)

```bash
pnpm dev:server
```

Verify:

```bash
curl http://localhost:3001/api/health
```

### 5. Start gateway-app (port 3000) and obtain admin JWT

```bash
cd gateway-app
cp .env.example .env
# Set JWT_SECRET and JWT_ISSUER to match gateway .env
# Set GATEWAY_API_URL=http://localhost:3001
pnpm dev
```

```bash
ADMIN_JWT=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<ADMIN_PASSWORD>"}' \
  | jq -r '.token')
```

### 6. Register an agent and capture `runtime_token`

```bash
curl -s -X POST http://localhost:3001/api/v1/admin/agents \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-openclaw-agent",
    "upstreamUrl": "http://localhost:3001/api/v1/mcp/mcp",
    "description": "OpenClaw agent with policy enforcement"
  }' | jq .
```

Save the `runtime_token` (`art_xxx`) — it is shown **once**.

### 7. Seed policies and capture `PROVIDER_ID`

```bash
ADMIN_JWT="$ADMIN_JWT" AGENT_ID="<agent.id>" bash seed-openclaw-policies.sh
```

### 8. Configure `~/.openclaw/openclaw.json`

```jsonc
{
  "plugins": {
    "entries": {
      "lobster-shell": {
        "enabled": true,
        "config": {
          "gatewayUrl": "http://localhost:3001",
          "gatewayRoot": "/path/to/agent-gateway",
          "providerId": "<PROVIDER_ID>",
          "timeoutMs": 310000,
          "skipTools": []
        }
      }
    }
  },
  "env": {
    "vars": {
      "SIMPLAIX_AGENT_RUNTIME_TOKEN": "<art_xxx>"
    }
  }
}
```

### 9. Install the plugin

```bash
openclaw plugins install @simplaix/lobster-shell
```

### 10. Start Cloudflare tunnel, then restart gateway

```bash
./scripts/dev-tunnel.sh
# Writes GATEWAY_PUBLIC_URL to .env
```

Restart the gateway server so deep links use the public URL.

### 11. Guide users to `/pair`

Share the gateway-app URL (`http://localhost:3000` or public tunnel URL). Users send `/pair` in WhatsApp/Telegram, tap the returned link, and the mobile approval app connects.

### Verify

- `/api/health` returns healthy
- Plugin initialization log: `[simplaix-gateway] Policy & Audit plugin initialized`
- Tool calls hit `evaluate` and `audit` endpoints
- High-risk tools trigger mobile confirmation
- Users can pair successfully

## Configuration reference

### Plugin config (`openclaw.json` → `plugins.entries.lobster-shell.config`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gatewayUrl` | `string` | *required* | Gateway base URL (e.g. `http://localhost:3001`) |
| `gatewayRoot` | `string` | — | Local path to agent-gateway repo (for `/lobster-shell start`) |
| `providerId` | `string` | `"lobster-shell"` | Provider ID for policy evaluation |
| `timeoutMs` | `number` | `310000` | HTTP timeout (ms) for evaluate endpoint |
| `skipTools` | `string[]` | `[]` | Tool names to skip (no policy check, no audit) |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIMPLAIX_AGENT_RUNTIME_TOKEN` | Yes | Agent runtime token (`art_xxx`) from step 6 |
| `SIMPLAIX_GATEWAY_URL` | No | Alternative to `gatewayUrl` in config |

## OpenClaw hook notes

- OpenClaw may call `register()` twice; the plugin guards against duplicate registration.
- `after_tool_call` fires twice per execution — the plugin only sends the audit on the second (complete) invocation that includes `durationMs`.
- `after_tool_call` context lacks `sessionKey`, so `toolName` is used as the correlation key.

## Files

```
lobster-shell/
  package.json            # @simplaix/lobster-shell
  openclaw.plugin.json    # Plugin manifest (config schema, UI hints)
  index.ts                # Entry point (hooks + commands)
  skills/                 # Agent setup skills
  README.md
```

## License

See the Simplaix Gateway repository license.
