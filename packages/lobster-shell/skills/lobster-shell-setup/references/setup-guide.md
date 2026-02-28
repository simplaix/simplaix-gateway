# OpenClaw Agent One-Click Setup Guide (Simplaix Gateway + @simplaix/lobster-shell)

> Goal: let an OpenClaw agent complete installation and configuration end-to-end, then guide the user to finish mobile `/pair`.

## Use Cases

- You want OpenClaw to automatically deploy `simplaix/agent-gateway`
- You want to install the OpenClaw plugin via command: `@simplaix/lobster-shell`
- You want mobile approval support (pairing with the phone app)

---

## Required Execution Order (must follow in sequence)

1. Clone source code (GitHub)
2. Start PostgreSQL
3. Create and configure gateway `.env`
4. Install dependencies + run DB migration
5. Start gateway server (3001)
6. Start gateway-app (3000) and log in to get `ADMIN_JWT`
7. Register an agent and get `runtime_token` (`art_xxx`)
8. Seed policies and get `providerId`
9. Update `~/.openclaw/openclaw.json` (`gatewayUrl` + `gatewayRoot` + `providerId` + `SIMPLAIX_AGENT_RUNTIME_TOKEN`)
10. Install OpenClaw plugin via command: `openclaw plugins install @simplaix/lobster-shell`
11. Start Cloudflare tunnel (tunnel first, then restart gateway)
12. Send user the `gateway-app` URL + `/pair` mobile onboarding steps

---

## 1) Clone source

```bash
git clone https://github.com/simplaix/agent-gateway.git
cd agent-gateway
```

---

## 2) Start PostgreSQL

```bash
docker compose up -d postgres
```

---

## 3) Configure gateway `.env`

```bash
cp .env.example .env
```

At minimum, ensure these values are valid:

- `JWT_SECRET` (strong random string)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DATABASE_URL=postgresql://gateway:gateway@localhost:5432/gateway`
- `PORT=3001`

---

## 4) Install dependencies + migrate

```bash
pnpm install --config.auto-install-peers=false
pnpm db:generate   # run first if migrate complains about missing journal/meta
pnpm db:migrate
```

---

## 5) Start gateway server

```bash
pnpm dev:server
```

Health check:

```bash
curl http://localhost:3001/api/health
```

---

## 6) Start gateway-app (for management and login)

```bash
cd gateway-app
cp .env.example .env
```

Make sure:

- `JWT_SECRET` matches root `.env`
- `JWT_ISSUER` matches root `.env`
- `GATEWAY_API_URL=http://localhost:3001`

Start app:

```bash
pnpm dev
```

Get `ADMIN_JWT`:

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<ADMIN_PASSWORD>"}' | jq -r '.token'
```

---

## 7) Register agent (get runtime token)

> Note: current backend schema requires `upstreamUrl`.

```bash
curl -s -X POST http://localhost:3001/api/v1/admin/agents \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-lobster-agent",
    "upstreamUrl": "http://localhost:3001/api/v1/mcp/mcp",
    "description": "Lobster Shell agent with policy enforcement"
  }'
```

Save from response:

- `agent.id`
- `runtime_token` (`art_xxx`, shown only once)

---

## 8) Seed tool policies (get providerId)

```bash
ADMIN_JWT="$ADMIN_JWT" AGENT_ID="<agent.id>" bash seed-openclaw-policies.sh
```

Save the printed `PROVIDER_ID`.

---

## 9) Update OpenClaw config (do this before plugin install)

Edit `~/.openclaw/openclaw.json` and ensure:

```json
{
  "plugins": {
    "entries": {
      "lobster-shell": {
        "enabled": true,
        "config": {
          "gatewayUrl": "http://localhost:3001",
          "gatewayRoot": "/absolute/path/to/agent-gateway",
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

> `gatewayUrl` is required.
> `gatewayRoot` should be configured for `/lobster-shell start` (no hardcoded default path).

---

## 10) Install OpenClaw plugin (command-based as required)

```bash
openclaw plugins install @simplaix/lobster-shell
```

If a same-name plugin directory already exists, back it up/remove it before reinstalling.

---

## 11) Start Cloudflare tunnel first, then restart gateway

```bash
cd <agent-gateway-root>
./scripts/dev-tunnel.sh
```

This script writes:

- `GATEWAY_PUBLIC_URL=https://xxxx.trycloudflare.com`

Then **restart** gateway (so new URL is applied):

```bash
# stop old process first, then restart
pnpm dev:server
```

---

## 12) Deliver to user: management URL + mobile pairing guidance

### 12.1 Tell user where to manage Gateway

- Local management page: `http://localhost:3000`
- If remote access exists, also provide the remotely reachable URL

### 12.2 Guide user to pair mobile app

Send this guidance to the user:

1. In WhatsApp/Telegram, send: `/pair`
2. Bot returns an HTTPS pairing link (`.../api/v1/auth/pair-link/...`)
3. Install and open Simplaix Approval App on phone
4. Tap pairing link, which deep-links into app and completes binding
5. After pairing, high-risk tools (e.g., `exec`) trigger mobile approval prompts

If no push notification arrives, check:

- `GATEWAY_PUBLIC_URL` is public HTTPS
- `/pair` completed successfully
- Server logs do not show `No devices registered for user ...`

---

## Verification Checklist (agent must complete)

- [ ] `GET /api/health` returns healthy
- [ ] OpenClaw logs contain: `[simplaix-gateway] Policy & Audit plugin initialized`
- [ ] Normal tool calls produce `/tool-gate/evaluate` + `/tool-gate/audit`
- [ ] High-risk tools produce `require_confirmation`
- [ ] User receives clickable `/pair` link and completes mobile pairing

---

## FAQ

### Q1: Why is endUser an agentId instead of phone number?
Because current request context does not include a resolvable direct peerId (or no `X-End-User-Id` header), so Gateway falls back to agent identity.

### Q2: Why duplicate/unsafe warning after plugin install?
- duplicate: an old plugin directory with same id exists; remove/rename then reinstall
- unsafe warning: static risk warning; requires manual trust decision (official npm source + code review)

### Q3: `pnpm db:migrate` reports missing meta/journal
Run `pnpm db:generate` first, then `pnpm db:migrate`.
