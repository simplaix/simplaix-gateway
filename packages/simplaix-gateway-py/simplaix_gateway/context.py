"""Per-request gateway context stored in ContextVars.

The :class:`GatewayMiddleware` (or any ASGI middleware) populates these
variables from the headers injected by the Gateway at invoke time.
The MCP transport's ``headers_factory`` reads them to propagate user
context back to the Gateway's MCP proxy.

Usage::

    from simplaix_gateway.context import get_session_token, get_end_user_id

    token = get_session_token()   # current request's session JWT
    user  = get_end_user_id()     # current request's end-user ID
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

# ---------------------------------------------------------------------------
# ContextVars — one per gateway-injected header
# ---------------------------------------------------------------------------

_session_token: ContextVar[str] = ContextVar(
    "_gw_session_token", default=""
)

_request_id: ContextVar[str] = ContextVar(
    "_gw_request_id", default=""
)

_end_user_id: ContextVar[str] = ContextVar(
    "_gw_end_user_id", default=""
)

_tenant_id: ContextVar[str] = ContextVar(
    "_gw_tenant_id", default=""
)

_end_user_roles: ContextVar[str] = ContextVar(
    "_gw_end_user_roles", default=""
)

_agent_id: ContextVar[str] = ContextVar(
    "_gw_agent_id", default=""
)

# ---------------------------------------------------------------------------
# Setters
# ---------------------------------------------------------------------------


def set_session_token(value: str) -> None:
    _session_token.set(value)


def set_request_id(value: str) -> None:
    _request_id.set(value)


def set_end_user_id(value: str) -> None:
    _end_user_id.set(value)


def set_tenant_id(value: str) -> None:
    _tenant_id.set(value)


def set_end_user_roles(value: str) -> None:
    _end_user_roles.set(value)


def set_agent_id(value: str) -> None:
    _agent_id.set(value)


# ---------------------------------------------------------------------------
# Getters
# ---------------------------------------------------------------------------


def get_session_token() -> str:
    return _session_token.get()


def get_request_id() -> str:
    return _request_id.get()


def get_end_user_id() -> str:
    return _end_user_id.get()


def get_tenant_id() -> str:
    return _tenant_id.get()


def get_end_user_roles() -> str:
    return _end_user_roles.get()


def get_agent_id() -> str:
    return _agent_id.get()


def clear_context() -> None:
    """Reset all gateway context vars (useful in tests)."""
    _session_token.set("")
    _request_id.set("")
    _end_user_id.set("")
    _tenant_id.set("")
    _end_user_roles.set("")
    _agent_id.set("")
