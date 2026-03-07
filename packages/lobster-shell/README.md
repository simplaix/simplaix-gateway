# lobster-shell

OpenClaw plugin (`@simplaix/lobster-shell`) for [Simplaix Gateway](https://github.com/simplaix/simplaix-gateway) — **tool policy evaluation**, **audit logging**, and **mobile approval pairing**.

Every tool call made by an OpenClaw agent is intercepted:

1. **Before execution** — calls `/api/v1/tool-gate/evaluate` to check policy. The Gateway may `allow`, `deny`, or `require_confirmation` (human-in-the-loop). Denied or rejected calls are blocked before the tool runs.
2. **After execution** — calls `/api/v1/tool-gate/audit` to record the result, error status, and duration.

The plugin registers a `/pair` command that generates a deep link for the Simplaix mobile approval app. If the Gateway is unreachable, the plugin **fails open** (tool calls proceed with a warning).

---

## Quick setup

Assumes the gateway is already running at `http://localhost:7521`. Need to set up the gateway first? See the [Simplaix Gateway docs](https://github.com/simplaix/simplaix-gateway).

### Step 1 — Get an admin JWT

```bash
ADMIN_JWT=$(curl -s -X POST http://localhost:7521/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme123"}' \
  | jq -r '.token')

echo "$ADMIN_JWT"   # verify it's not empty
```

### Step 2 — Register an agent

```bash
AGENT_RESPONSE=$(curl -s -X POST http://localhost:7521/api/v1/admin/agents \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-openclaw-agent","upstreamUrl":"http://localhost:8000"}')

AGENT_ID=$(echo "$AGENT_RESPONSE" | jq -r '.agent.id')
RUNTIME_TOKEN=$(echo "$AGENT_RESPONSE" | jq -r '.runtime_token')

echo "AGENT_ID=$AGENT_ID"
echo "RUNTIME_TOKEN=$RUNTIME_TOKEN"
```

> The `runtime_token` (`art_xxx`) is shown **only once**. Save it now.

### Step 3 — Seed tool policies

```bash
ADMIN_JWT="$ADMIN_JWT" AGENT_ID="$AGENT_ID" bash \
  "$(npm root -g)/@simplaix/lobster-shell/seed-openclaw-policies.sh"
```

This creates a virtual tool provider and 24 per-tool policy rules. Save the **Provider ID** printed at the end.

<details>
<summary>What does the script do?</summary>

Creates one virtual tool provider (`openclaw`) and seeds 24 per-tool policy rules for the registered agent:

| Tool | Action | Risk |
|------|--------|------|
| `exec` | `require_confirmation` | high |
| `read` | `allow` | low |
| `write` | `require_confirmation` | medium |
| `edit` | `require_confirmation` | medium |
| `browser` | `require_confirmation` | medium |
| `message` | `require_confirmation` | high |
| `nodes` | `require_confirmation` | high |
| `cron` | `require_confirmation` | high |
| `gateway` | `require_confirmation` | critical |
| `canvas` | `require_confirmation` | medium |
| `sessions_spawn` | `require_confirmation` | medium |
| `sessions_send` | `require_confirmation` | medium |
| `web_fetch` | `allow` | low |
| `web_search` | `allow` | low |
| `image` | `allow` | low |
| `tts` | `allow` | low |
| `memory_get` | `allow` | low |
| `memory_search` | `allow` | low |
| `session_status` | `allow` | low |
| `sessions_list` | `allow` | low |
| `sessions_history` | `allow` | low |
| `agents_list` | `allow` | low |
| `subagents` | `allow` | low |
| `*` | `allow` | low |

Optional env vars: `GATEWAY_URL` (default `http://localhost:7521`), `PROVIDER_ID` (skip provider creation and use an existing one).

</details>

### Step 4 — Install the plugin

```bash
openclaw plugins install @simplaix/lobster-shell
```

### Step 5 — Configure OpenClaw

Edit `~/.openclaw/openclaw.json` (create the file if it doesn't exist):

```json
{
  "plugins": {
    "entries": {
      "lobster-shell": {
        "enabled": true,
        "config": {
          "gatewayUrl": "http://localhost:7521",
          "providerId": "<PROVIDER_ID from step 3>"
        }
      }
    }
  },
  "env": {
    "vars": {
      "SIMPLAIX_AGENT_RUNTIME_TOKEN": "<RUNTIME_TOKEN from step 2>"
    }
  }
}
```

### Step 6 — Restart OpenClaw

After saving `openclaw.json`, restart OpenClaw to pick up the new token and plugin config:

```bash
openclaw restart
```

### Step 7 — Verify

Start OpenClaw. You should see in the logs:

```
[simplaix-gateway] Policy & Audit plugin initialized
```

Make a tool call. Policy evaluation will appear in the gateway logs and audit records at `GET /api/v1/audit`.

---

## Connecting OpenClaw to the Gateway MCP

The gateway exposes two MCP endpoints at startup:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/v1/mcp/mcp` | Runtime token (`art_xxx`) | Unified proxy — aggregates tools from all registered upstream MCP providers |

Available tools: `list_agents`, `create_agent`, `list_access_policies`, `create_access_policy`, `list_pending_confirmations`, `confirm_request`, `reject_request`, `get_audit_logs`, and more.

### Unified MCP proxy

Uses the runtime token already set in `SIMPLAIX_AGENT_RUNTIME_TOKEN`. Add to `~/.openclaw/openclaw.json`:

```json
{
  "mcp": {
    "servers": {
      "simplaix-tools": {
        "url": "http://localhost:7521/api/v1/mcp/mcp",
        "headers": {
          "Authorization": "Bearer <RUNTIME_TOKEN>"
        }
      }
    }
  }
}
```

This endpoint aggregates tools from all upstream MCP providers the agent is authorized to access.

---

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

---

## Configuration reference

### Plugin config (`openclaw.json` → `plugins.entries.lobster-shell.config`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gatewayUrl` | `string` | *required* | Gateway base URL (e.g. `http://localhost:7521`) |
| `providerId` | `string` | `"lobster-shell"` | Provider ID for policy evaluation |
| `timeoutMs` | `number` | `310000` | HTTP timeout (ms) for evaluate endpoint |
| `skipTools` | `string[]` | `[]` | Tool names to skip (no policy check, no audit) |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIMPLAIX_AGENT_RUNTIME_TOKEN` | Yes | Agent runtime token (`art_xxx`) from step 6 |
| `SIMPLAIX_GATEWAY_URL` | No | Alternative to `gatewayUrl` in config |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ADMIN_JWT` is empty | Wrong email/password or gateway not running | Check `gateway start` is running, re-run step 5 |
| `runtime_token` is `null` | Agent already exists with same name | Delete the existing agent or use a different name |
| Seed script fails with 401 | JWT expired (24h TTL) | Re-run step 5 to get a fresh `ADMIN_JWT` |
| Plugin logs "No gatewayUrl configured" | Missing config in `openclaw.json` | Check step 9 — `gatewayUrl` must be set |
| Tool calls not being evaluated | Wrong `providerId` | Ensure `providerId` in `openclaw.json` matches the ID from step 7 |
| `jq: error` | `jq` not installed | `brew install jq` (macOS) or `apt install jq` (Linux) |

---

## OpenClaw hook notes

- OpenClaw may call `register()` twice; the plugin guards against duplicate registration.
- `after_tool_call` fires twice per execution — the plugin only sends the audit on the second (complete) invocation that includes `durationMs`.
- `after_tool_call` context lacks `sessionKey`, so `toolName` is used as the correlation key.

## Files

```
lobster-shell/
  package.json                  # @simplaix/lobster-shell
  openclaw.plugin.json          # Plugin manifest (config schema, UI hints)
  index.ts                      # Entry point (hooks + commands)
  seed-openclaw-policies.sh     # Seeds default tool policies
  skills/                       # Agent setup skills
  README.md
```

## License

See the Simplaix Gateway repository license.
