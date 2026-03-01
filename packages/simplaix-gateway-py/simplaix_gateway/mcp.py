"""MCP transport helpers for connecting to Simplaix Gateway's MCP proxy.

Provides a thin wrapper around the official ``mcp`` package so you don't have
to manually build auth headers or construct proxy URLs.  Framework-agnostic —
works with Strands, LangChain, or the raw MCP ``ClientSession``.

Unified mode (recommended) — connect to the gateway once, get all
authorized tools automatically::

    from simplaix_gateway.mcp import GatewayMCPTransport

    transport = GatewayMCPTransport()
    mcp_client = YourMCPClient(transport)

Selected providers — connect to specific providers only::

    transport = GatewayMCPTransport(provider_id=["provider-a", "provider-b"])

With per-request user context (multi-user agents)::

    from simplaix_gateway.mcp import GatewayMCPTransport, default_headers_factory

    transport = GatewayMCPTransport(
        headers_factory=default_headers_factory,
    )
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from .settings import GatewaySettings, get_settings

logger = logging.getLogger("simplaix_gateway.mcp")


def default_headers_factory() -> dict[str, str]:
    """Read gateway context from ContextVars and return as headers.

    Designed to be used with :class:`GatewayMCPTransport`'s
    ``headers_factory`` parameter.  Reads the session token, request ID,
    and end-user ID that were stored by :class:`GatewayMiddleware`.
    """
    from .context import get_session_token, get_request_id, get_end_user_id

    headers: dict[str, str] = {}
    if token := get_session_token():
        headers["X-Gateway-Session-Token"] = token
    if req_id := get_request_id():
        headers["X-Gateway-Request-ID"] = req_id
    if user_id := get_end_user_id():
        headers["X-End-User-ID"] = user_id
    return headers


class GatewayMCPTransport:
    """Callable transport factory for connecting to the Gateway's MCP proxy.

    Instances are callable — invoke with ``transport()`` to get the
    ``streamablehttp_client`` async context manager.  Pass the instance
    directly to any framework's MCP client that expects a transport callable.

    Parameters
    ----------
    provider_id:
        Which provider(s) to connect to.

        - ``None`` (default) — **unified** endpoint; aggregates tools from
          *all* providers the agent is authorized to access.
        - ``list[str]`` — uses the unified endpoint with a
          ``?providers=id1,id2`` filter so only the listed providers are
          included.  Pass a single-element list for one provider.
    gateway_url:
        Gateway base URL.  Overrides ``GATEWAY_API_URL`` from env/settings.
    token:
        Agent runtime token.  Overrides ``AGENT_RUNTIME_TOKEN`` from env/settings.
    extra_headers:
        Static headers to include in every MCP request.
    headers_factory:
        Optional callable evaluated at **each** ``__call__`` invocation.
        The returned dict is merged on top of the static headers.  Use
        :func:`default_headers_factory` to forward the session token and
        user context captured by :class:`GatewayMiddleware`.
    settings:
        Custom ``GatewaySettings`` instance.  When ``None``, a fresh instance
        is created from the current environment / ``.env`` file.

    Examples
    --------
    Unified mode — all authorized tools via one connection::

        transport = GatewayMCPTransport()

    Selected providers::

        transport = GatewayMCPTransport(provider_id=["slack", "github"])

    Single provider::

        transport = GatewayMCPTransport(provider_id=["github"])

    With per-request user context (multi-user agents)::

        transport = GatewayMCPTransport(
            headers_factory=default_headers_factory,
        )

    Custom header logic::

        transport = GatewayMCPTransport(
            provider_id=["github"],
            headers_factory=lambda: {"X-Custom": get_custom_value()},
        )
    """

    def __init__(
        self,
        provider_id: list[str] | None = None,
        *,
        gateway_url: str | None = None,
        token: str | None = None,
        extra_headers: dict[str, str] | None = None,
        headers_factory: Callable[[], dict[str, str]] | None = None,
        settings: GatewaySettings | None = None,
    ):
        cfg = settings or get_settings()

        base = (gateway_url or cfg.gateway_api_url).rstrip("/")
        if provider_id:
            qs = ",".join(provider_id)
            self.url = f"{base}/api/v1/mcp/mcp?providers={qs}"
            mode = f"providers=[{qs}]"
        else:
            self.url = f"{base}/api/v1/mcp/mcp"
            mode = "unified"
        self.provider_id = provider_id
        self.headers_factory = headers_factory if headers_factory is not None else default_headers_factory

        self.headers: dict[str, str] = {}
        resolved_token = token if token is not None else cfg.agent_runtime_token
        if resolved_token:
            self.headers["Authorization"] = f"Bearer {resolved_token}"
        if extra_headers:
            self.headers.update(extra_headers)

        logger.info(
            "[GatewayMCPTransport] Initialized: mode=%s, url=%s, has_token=%s, has_headers_factory=%s",
            mode, self.url, bool(resolved_token), headers_factory is not None,
        )

    def __call__(self) -> Any:
        """Return the ``streamablehttp_client`` async context manager.

        If a ``headers_factory`` was provided, it is called now and the
        returned headers are merged on top of the static ones.
        """
        from mcp.client.streamable_http import streamablehttp_client

        headers = dict(self.headers)  # copy static headers
        if self.headers_factory:
            dynamic = self.headers_factory()
            if dynamic:
                headers.update(dynamic)
                logger.debug(
                    "[GatewayMCPTransport] Dynamic headers injected: %s",
                    ", ".join(dynamic.keys()),
                )

        logger.debug(
            "[GatewayMCPTransport] Opening MCP connection to %s (headers: %s)",
            self.url,
            ", ".join(headers.keys()),
        )
        return streamablehttp_client(url=self.url, headers=headers)

    def __repr__(self) -> str:
        if self.provider_id is None:
            mode = "unified"
        else:
            mode = f"provider_id={self.provider_id!r}"
        return f"GatewayMCPTransport({mode}, url={self.url!r})"
