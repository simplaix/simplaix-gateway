---
name: lobster-shell-setup
description: End-to-end setup for Simplaix Gateway + @simplaix/lobster-shell in OpenClaw. Installs the gateway via npm (no Docker required), initialises workspace, starts gateway with dashboard, creates admin user, registers agent, seeds policies, configures openclaw.json, installs plugin, and guides mobile /pair onboarding. Use when users ask to install/configure lobster-shell, fix setup issues, or bootstrap the approval flow.
---

Execute setup in this order:

1. Install gateway CLI: `npm install -g @simplaix/simplaix-gateway`
2. Create workspace: `mkdir my-gateway && cd my-gateway`
3. Initialise: `gateway init` (generates `.env` with secrets)
4. Start gateway + dashboard: `gateway start --tunnel --dashboard`
   - Gateway on `http://localhost:7521`
   - Dashboard UI on `http://localhost:3000`
   - Cloudflare tunnel prints public HTTPS URL
5. Create admin user: `gateway admin create --email <email> --password <pw>`
6. Get `ADMIN_JWT` via `POST http://localhost:3000/api/auth/login`
7. Register agent via `POST http://localhost:7521/api/v1/admin/agents` — save `runtime_token` (`art_xxx`, shown once) and `agent.id`
8. Seed policies: `ADMIN_JWT="..." AGENT_ID="..." bash seed-openclaw-policies.sh` — save `PROVIDER_ID`
9. Configure `~/.openclaw/openclaw.json`:
   - `plugins.entries.lobster-shell.config.gatewayUrl` = `http://localhost:7521`
   - `plugins.entries.lobster-shell.config.providerId` = `<PROVIDER_ID>`
   - `env.vars.SIMPLAIX_AGENT_RUNTIME_TOKEN` = `<art_xxx>`
10. Install plugin: `openclaw plugins install @simplaix/lobster-shell`
11. Guide user to `/pair` — share dashboard URL (`http://localhost:3000` or tunnel URL)

Always verify:

- `GET http://localhost:7521/api/health` returns healthy
- OpenClaw logs contain: `[simplaix-gateway] Policy & Audit plugin initialized`
- Normal tool calls produce `/tool-gate/evaluate` + `/tool-gate/audit`
- High-risk tools produce `require_confirmation`
- User receives clickable `/pair` link and completes mobile pairing

For the full command-by-command playbook, read:
`{baseDir}/references/setup-guide.md`
