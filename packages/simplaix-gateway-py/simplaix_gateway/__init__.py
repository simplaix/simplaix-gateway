"""Simplaix Gateway Python SDK.

Provides:
- **MCP helpers** — connect to the Gateway's MCP proxy with automatic token
  handling.  Framework-agnostic (works with Strands, LangChain, raw MCP SDK).
- **Middleware** — captures Gateway-injected headers into ContextVars for
  per-request user context propagation.
- **Credential SDK** — resolve user credentials from the Gateway.
- **Settings** — centralized env configuration via Pydantic.

Quick start::

    from simplaix_gateway.mcp import GatewayMCPTransport
    transport = GatewayMCPTransport(provider_id=["<provider-id>"])

With per-request user context::

    from simplaix_gateway.mcp import GatewayMCPTransport, default_headers_factory
    from simplaix_gateway.middleware import GatewayMiddleware

    app.add_middleware(GatewayMiddleware)
    transport = GatewayMCPTransport(
        provider_id=["<provider-id>"],
        headers_factory=default_headers_factory,
    )
"""

from .settings import GatewaySettings, get_settings
from .mcp import GatewayMCPTransport, default_headers_factory
from .middleware import GatewayMiddleware

__all__ = [
    "GatewaySettings",
    "get_settings",
    "GatewayMCPTransport",
    "default_headers_factory",
    "GatewayMiddleware",
]
