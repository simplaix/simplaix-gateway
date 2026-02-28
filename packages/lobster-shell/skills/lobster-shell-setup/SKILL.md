---
name: lobster-shell-setup
description: End-to-end setup for Simplaix Gateway + @simplaix/lobster-shell in OpenClaw, including GitHub clone, plugin install, openclaw.json config, Cloudflare tunnel, and mobile /pair onboarding. Use when users ask to install/configure lobster-shell, fix setup issues, or bootstrap approval flow.
---

Execute setup in this order:

1. Clone `https://github.com/simplaix/agent-gateway`
2. Start PostgreSQL
3. Configure `.env`
4. Install deps and migrate DB
5. Start gateway server (`3001`)
6. Start gateway-app (`3000`) and obtain `ADMIN_JWT`
7. Register agent and capture `runtime_token` (`art_xxx`)
8. Seed policies and capture `PROVIDER_ID`
9. Install plugin: `openclaw plugins install @simplaix/lobster-shell`
10. Configure `~/.openclaw/openclaw.json` with:
   - `plugins.entries.lobster-shell.config.gatewayUrl`
   - `providerId`
   - `env.vars.SIMPLAIX_AGENT_RUNTIME_TOKEN`
11. Start Cloudflare tunnel first, then restart gateway
12. Give user gateway-app URL and guide `/pair`

Always verify:

- `/api/health` is healthy
- plugin initialization log appears
- evaluate + audit endpoints are hit
- high-risk tools require confirmation
- user can pair mobile app successfully

For the full command-by-command playbook, read:
`{baseDir}/references/setup-guide.md`
