# OpenAI Agents SDK (Python) + Gateway MCP Example

A minimal example that shows:
1. A Python agent runtime built with the latest `openai-agents` SDK.
2. The runtime connects to Simplaix Gateway MCP through the `simplaix-gateway` SDK (`GatewayMCPTransport` + `GatewayMiddleware`).
3. A client script invokes the runtime through Gateway (`/api/v1/agents/:agentId/invoke`).

## Files

- `agent_runtime.py`: FastAPI runtime using OpenAI Agents SDK + Gateway MCP.
- `invoke_via_gateway.py`: test script that calls Gateway invoke endpoint.
- `pyproject.toml`: uv project dependencies (includes local path source to `packages/simplaix-gateway-py`).
- `.env.example`: environment variables.

## 1) Install

```bash
cd examples/openai-agents-gateway-python
uv sync
```

## 2) Configure env

```bash
cp .env.example .env
```

Set at least:
- `OPENAI_API_KEY`
- `GATEWAY_API_URL`
- `AGENT_RUNTIME_TOKEN` (the `art_...` token returned when creating the agent)
- optional: `GATEWAY_PROVIDER_IDS=providerA,providerB` (empty = unified mode)

For `invoke_via_gateway.py`, you also need:
- `GATEWAY_AGENT_ID` — the agent ID returned when registering the agent
- **Option 1:** `GATEWAY_USER_JWT` — provide a pre-made end-user JWT directly
- **Option 2:** `CLIENT_JWT_SECRET` + `CLIENT_JWT_ISSUER` — auto-generate a test JWT (the secret and issuer must match gateway's `JWT_EXTERNAL_ISSUERS` config)

## 3) Register this runtime as an agent in Gateway

Use your creator/admin JWT:

```bash
curl -X POST http://localhost:3001/api/v1/admin/agents \
  -H "Authorization: Bearer <creator-or-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "openai-agents-python-example",
    "upstreamUrl": "http://localhost:8000",
    "description": "OpenAI Agents SDK runtime via Gateway MCP"
  }'
```

Copy the returned:
- `agent.id` -> set `GATEWAY_AGENT_ID` in `.env`
- `runtime_token` -> set `AGENT_RUNTIME_TOKEN` in `.env`

## 4) Start runtime

```bash
uv run python agent_runtime.py
```

Runtime listens on `http://localhost:8000`.

## 5) Invoke through Gateway

```bash
uv run python invoke_via_gateway.py
```

This script calls:
- `POST /api/v1/agents/<agentId>/invoke`

Gateway then forwards to your runtime, and your runtime uses:
- `POST /api/v1/mcp/mcp`

## Notes

- If your agent has no provider access, MCP tool listing/calls will return no tools or access errors.
- This example uses `GatewayMiddleware` to capture incoming user context and `default_headers_factory` to forward it to MCP proxy calls.
