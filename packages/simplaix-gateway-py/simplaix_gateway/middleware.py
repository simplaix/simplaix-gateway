"""ASGI middleware that captures Gateway-injected headers into ContextVars.

Works with any ASGI framework (FastAPI, Starlette, Litestar, etc.).  The
middleware is a pure ASGI app wrapper — no framework-specific imports.

Usage with **FastAPI / Starlette**::

    from simplaix_gateway.middleware import GatewayMiddleware

    app.add_middleware(GatewayMiddleware)

Usage with **any ASGI app**::

    app = GatewayMiddleware(app)
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from .context import (
    set_session_token,
    set_request_id,
    set_end_user_id,
    set_tenant_id,
    set_end_user_roles,
    set_agent_id,
)
from .credentials.client import set_user_id, set_injected_credentials

logger = logging.getLogger("simplaix_gateway.middleware")

# Header name → setter (all lowercase for case-insensitive matching)
_HEADER_SETTERS: dict[str, Callable[[str], None]] = {
    "x-gateway-session-token": set_session_token,
    "x-gateway-request-id": set_request_id,
    "x-end-user-id": set_end_user_id,
    "x-user-id": set_user_id,  # credential SDK compat
    "x-tenant-id": set_tenant_id,
    "x-end-user-roles": set_end_user_roles,
    "x-gateway-agent-id": set_agent_id,
}

_X_CREDENTIAL_PREFIX = "x-credential-"


class GatewayMiddleware:
    """Pure ASGI middleware that captures all Gateway-injected headers.

    Populates :mod:`simplaix_gateway.context` ContextVars **and** the
    credential SDK's ``set_user_id`` / ``set_injected_credentials``
    helpers so both the MCP transport and the credential client can
    access per-request context.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))

        # Decode and store known gateway headers
        captured: list[str] = []
        for raw_name, raw_value in headers.items():
            name = raw_name.decode("latin-1").lower() if isinstance(raw_name, bytes) else raw_name.lower()
            value = raw_value.decode("latin-1") if isinstance(raw_value, bytes) else raw_value

            setter = _HEADER_SETTERS.get(name)
            if setter:
                setter(value)
                captured.append(name)

        if captured:
            logger.debug("[GatewayMiddleware] Captured headers: %s", ", ".join(captured))

        # Collect X-Credential-* headers for the credential SDK
        creds: dict[str, str] = {}
        for raw_name, raw_value in headers.items():
            name = raw_name.decode("latin-1").lower() if isinstance(raw_name, bytes) else raw_name.lower()
            if name.startswith(_X_CREDENTIAL_PREFIX):
                service_type = name[len(_X_CREDENTIAL_PREFIX):]
                value = raw_value.decode("latin-1") if isinstance(raw_value, bytes) else raw_value
                creds[service_type] = value
        if creds:
            set_injected_credentials(creds)
            logger.debug("[GatewayMiddleware] Injected credentials for: %s", ", ".join(creds.keys()))

        await self.app(scope, receive, send)
