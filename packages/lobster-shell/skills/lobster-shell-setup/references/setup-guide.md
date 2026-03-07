# OpenClaw Agent Setup Guide (Simplaix Gateway + @simplaix/lobster-shell)

> Goal: let an OpenClaw agent complete installation and configuration end-to-end, then guide the user to finish mobile `/pair`.
>
> No Docker or PostgreSQL required — gateway uses SQLite by default.

## Use Cases

- You want OpenClaw to automatically deploy Simplaix Gateway
- You want to install the OpenClaw plugin: `@simplaix/lobster-shell`
- You want mobile approval support (pairing with the phone app)

---

## Required Execution Order (must follow in sequence)

1. Install gateway CLI via npm
2. Create workspace and initialise
3. Start gateway with dashboard (and optional tunnel)
4. Create admin user
5. Get `ADMIN_JWT`
6. Register agent and get `runtime_token` (`art_xxx`)
7. Seed policies and get `providerId`
8. Update `~/.openclaw/openclaw.json`
9. Install OpenClaw plugin
10. Guide user to `/pair` mobile onboarding

---

## 1) Install gateway CLI

```bash
npm install -g @simplaix/simplaix-gateway
```

Verify:

```bash
gateway --version
```

---

## 2) Create workspace and initialise

```bash
mkdir my-gateway && cd my-gateway
gateway init
```

`gateway init` creates `.env` with auto-generated `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `DATABASE_URL`, and `PORT`.

---

## 3) Start gateway + dashboard

```bash
# Recommended: with public tunnel + dashboard UI
gateway start --tunnel --dashboard
```

This starts:
- **Gateway** on `http://localhost:7521`
- **Cloudflare tunnel** → prints `[Tunnel] Public URL: https://xxxx.trycloudflare.com`
- **Dashboard UI** on `http://localhost:3000`
- **Python agent** on `http://localhost:8000`

Save the tunnel URL as `GATEWAY_PUBLIC_URL` for `/pair` deep links.

Health check:

```bash
curl http://localhost:7521/api/health
```

---

## 4) Create admin user

```bash
gateway admin create --email admin@example.com --password yourpassword
```

---

## 5) Get admin JWT

```bash
ADMIN_JWT=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}' \
  | jq -r '.token')

echo $ADMIN_JWT
```

---

## 6) Register agent (get runtime token)

```bash
curl -s -X POST http://localhost:7521/api/v1/admin/agents \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-openclaw-agent",
    "upstreamUrl": "http://localhost:8000",
    "description": "OpenClaw agent with policy enforcement"
  }' | jq .
```

Save from response:

- `id` → `AGENT_ID`
- `runtimeToken` (`art_xxx`) → shown **once**, save immediately

---

## 7) Seed tool policies (get providerId)

Locate `seed-openclaw-policies.sh` (ships with the gateway package):

```bash
ADMIN_JWT="$ADMIN_JWT" AGENT_ID="<agent.id>" bash \
  $(npm root -g)/@simplaix/simplaix-gateway/seed-openclaw-policies.sh
```

Save the printed `PROVIDER_ID`.

---

## 8) Update OpenClaw config (do this before plugin install)

Edit `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "lobster-shell": {
        "enabled": true,
        "config": {
          "gatewayUrl": "http://localhost:7521",
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

---

## 9) Install OpenClaw plugin

```bash
openclaw plugins install @simplaix/lobster-shell
```

If a same-name plugin directory already exists, remove it first:

```bash
rm -rf ~/.openclaw/plugins/lobster-shell
openclaw plugins install @simplaix/lobster-shell
```

---

## 10) Guide user to `/pair`

### Tell user where to manage Gateway

- Dashboard: `http://localhost:3000`
- Public URL (if tunnel active): the URL printed in step 3

### Guide user to pair mobile app

Send this to the user:

1. In WhatsApp/Telegram, send: `/pair`
2. Bot returns an HTTPS pairing link (`https://xxxx.trycloudflare.com/api/v1/auth/pair-link/...`)
3. Install and open Simplaix Approval App on phone
4. Tap pairing link → deep-links into app → device registered
5. After pairing, high-risk tools (e.g., `exec`) trigger mobile approval prompts

If no push notification arrives, check:
- `GATEWAY_PUBLIC_URL` is set (requires `--tunnel` flag)
- `/pair` completed successfully
- Server logs do not show `No devices registered for user ...`

---

## Verification Checklist (agent must complete)

- [ ] `GET http://localhost:7521/api/health` returns healthy
- [ ] OpenClaw logs: `[simplaix-gateway] Policy & Audit plugin initialized`
- [ ] Normal tool calls produce `/tool-gate/evaluate` + `/tool-gate/audit`
- [ ] High-risk tools produce `require_confirmation`
- [ ] User receives clickable `/pair` link and completes mobile pairing

---

## FAQ

### Q1: Do I need Docker or PostgreSQL?

No. The gateway uses SQLite by default (`~/.simplaix-gateway/data/gateway.db`). PostgreSQL is optional — set `DATABASE_URL=postgres://...` in `.env` if needed.

### Q2: How do I restart the gateway?

Stop the running process (`Ctrl+C`), then:

```bash
gateway start --tunnel --dashboard
```

The tunnel URL changes on each restart — update any hardcoded URLs.

### Q3: Plugin warns "unsafe" on install

Static risk warning; requires manual trust decision. Official npm source — review code at [github.com/simplaix/simplaix-gateway](https://github.com/simplaix/simplaix-gateway).

### Q4: Duplicate plugin directory warning

Remove the old directory and reinstall:

```bash
rm -rf ~/.openclaw/plugins/lobster-shell
openclaw plugins install @simplaix/lobster-shell
```

### Q5: `endUser` shows as agentId instead of phone number

No `X-End-User-Id` header in current request context — Gateway falls back to agent identity. Expected behaviour.
