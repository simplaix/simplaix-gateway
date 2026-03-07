# Simplaix Gateway Python SDK

Python SDK for [Simplaix Gateway](https://simplaix.com), focused on:

- MCP proxy transport setup (no manual URL/header wiring)
- per-request user context propagation in ASGI apps
- credential resolution for end-user integrations

Package name on PyPI: `simplaix-gateway`

## Installation

```bash
pip install simplaix-gateway
```

## What This SDK Provides

1. `GatewayMCPTransport`
Creates a callable MCP transport for Gateway endpoints (`/api/v1/mcp/...`) and handles auth headers.

2. `GatewayMiddleware`
Captures Gateway-injected request headers (session token, end-user context, credential headers) into `ContextVar`s.

3. `default_headers_factory`
Builds dynamic headers from current request context so MCP calls run as the real end-user.

4. `CredentialClient`
Resolves/checks/lists user credentials through Gateway credential APIs.

5. `GatewaySettings`
Typed environment configuration via `pydantic-settings`.

## Environment Variables

| Variable | Default | Used by |
|---|---|---|
| `GATEWAY_API_URL` | `http://localhost:3001` | MCP transport + credential client |
| `AGENT_RUNTIME_TOKEN` | empty | MCP proxy `Authorization: Bearer ...` |

You can provide a `.env` file; settings are loaded at runtime.

## Quick Start

```python
from simplaix_gateway.mcp import GatewayMCPTransport

# Unified mode: one MCP endpoint, all authorized providers
transport = GatewayMCPTransport()
```

With Strands:

```python
from strands.tools.mcp import MCPClient
from simplaix_gateway.mcp import GatewayMCPTransport

transport = GatewayMCPTransport(provider_id=["<provider-id>"])
mcp_client = MCPClient(transport)
```

With raw MCP SDK:

```python
from mcp import ClientSession
from simplaix_gateway.mcp import GatewayMCPTransport

transport = GatewayMCPTransport()

async with transport() as (read_stream, write_stream):
    async with ClientSession(read_stream, write_stream) as session:
        await session.initialize()
        tools = await session.list_tools()
```

## MCP Transport Modes

```python
from simplaix_gateway.mcp import GatewayMCPTransport

# 1) Unified — all authorized providers (recommended)
t1 = GatewayMCPTransport()

# 2) Selected providers
t2 = GatewayMCPTransport(provider_id=["github", "slack"])
```

Explicit overrides:

```python
transport = GatewayMCPTransport(
    provider_id=["github"],
    gateway_url="https://gateway.example.com",
    token="rt_xxx",
    extra_headers={"X-Custom": "value"},
)
```

## Multi-User ASGI Integration

When Gateway calls your agent on behalf of an end-user, you usually want downstream MCP policy checks and audits to use that user identity.

### 1) Add middleware

```python
from simplaix_gateway.middleware import GatewayMiddleware

app.add_middleware(GatewayMiddleware)
```

### 2) Use dynamic headers in MCP transport

```python
from simplaix_gateway.mcp import GatewayMCPTransport, default_headers_factory

transport = GatewayMCPTransport(
    headers_factory=default_headers_factory,
)
```

### 3) Create MCP clients per request (important for frameworks that reuse connections)

```python
from strands import Agent
from strands.tools.mcp import MCPClient

async def handle_request():
    mcp_client = MCPClient(transport)
    with mcp_client:
        agent = Agent(model=model, tools=[mcp_client])
        ...
```

## Reading Gateway Context

`GatewayMiddleware` stores request-scoped values in `simplaix_gateway.context`:

```python
from simplaix_gateway.context import (
    get_session_token,
    get_end_user_id,
    get_request_id,
    get_tenant_id,
    get_end_user_roles,
    get_agent_id,
)

session_token = get_session_token()
user_id = get_end_user_id()
request_id = get_request_id()
```

## Credential SDK

Create a client:

```python
from simplaix_gateway.credentials import create_credential_client

client = create_credential_client()
```

Resolve multiple credentials:

```python
result = await client.resolve(["github", "stripe"], user_id="user_123")

print(result.credentials)  # {"github": "..."}
print(result.missing)      # ["stripe"]
print(result.auth_urls)    # {"stripe": "https://..."}
```

Get one credential:

```python
from simplaix_gateway.credentials import AuthenticationRequiredError, CredentialNotFoundError

try:
    token = await client.get_credential("github", user_id="user_123")
except AuthenticationRequiredError as e:
    print("Need auth:", e.auth_url)
except CredentialNotFoundError:
    print("Credential missing")
```

Other helpers:

```python
exists = await client.has_credential("github", user_id="user_123")
status = await client.check("github", user_id="user_123")
all_credentials = await client.list_credentials(user_id="user_123")
token_or_none = await client.get_credential_or_none("github", user_id="user_123")
required = await client.require_all(["github", "stripe"], user_id="user_123")
```

If middleware already injected `X-User-Id` / `X-Credential-*`, `CredentialClient` will reuse that request context automatically.

## Error Types

From `simplaix_gateway.credentials`:

- `CredentialError` (base class)
- `AuthenticationRequiredError`
- `CredentialNotFoundError`
- `CredentialExpiredError`
- `ApiError`
- `MultipleCredentialsMissingError`

## Settings API

```python
from simplaix_gateway.settings import get_settings, GatewaySettings

settings = get_settings()
print(settings.gateway_api_url)

custom = GatewaySettings(gateway_api_url="http://localhost:3001")
```

## Minimal End-to-End Example (FastAPI + Strands)

```python
import os
from fastapi import FastAPI
from strands import Agent
from strands.models.openai import OpenAIModel
from strands.tools.mcp import MCPClient

from simplaix_gateway.middleware import GatewayMiddleware
from simplaix_gateway.mcp import GatewayMCPTransport, default_headers_factory

app = FastAPI()
app.add_middleware(GatewayMiddleware)

transport = GatewayMCPTransport(
    provider_id=["github"],
    headers_factory=default_headers_factory,
)

model = OpenAIModel(
    client_args={"api_key": os.getenv("OPENAI_API_KEY", "")},
    model_id="gpt-4o",
)

@app.post("/chat")
async def chat():
    mcp_client = MCPClient(transport)
    with mcp_client:
        agent = Agent(model=model, tools=[mcp_client])
        # your invoke flow here
        return {"ok": True}
```

## License

MIT
