"""Credential Client for accessing user credentials from Simplaix Gateway."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

import httpx

from ..settings import GatewaySettings, get_settings
from .types import CredentialResolveResult, CredentialInfo, CredentialCheckResult
from .errors import (
    ApiError,
    AuthenticationRequiredError,
    CredentialNotFoundError,
    MultipleCredentialsMissingError,
)

# ---------------------------------------------------------------------------
# Module-level ContextVars (shared across all client instances)
# ---------------------------------------------------------------------------

_current_user_id: ContextVar[Optional[str]] = ContextVar(
    "_credential_sdk_user_id", default=None
)

_injected_credentials: ContextVar[dict[str, str]] = ContextVar(
    "_credential_sdk_injected", default={}
)


def set_user_id(user_id: Optional[str]) -> None:
    """Set the current user ID for this async/thread context."""
    _current_user_id.set(user_id)


def get_user_id() -> Optional[str]:
    """Get the current user ID from the context (if set)."""
    return _current_user_id.get()


def set_injected_credentials(creds: dict[str, str]) -> None:
    """Store pre-resolved credentials (from Gateway headers) in the context."""
    _injected_credentials.set(creds)


def get_injected_credentials() -> dict[str, str]:
    """Get pre-resolved credentials from the context."""
    return _injected_credentials.get()


class CredentialClient:
    """Client for accessing user credentials from Simplaix Gateway.

    Supports three credential resolution strategies (checked in order):

    1. **Injected credentials** — pre-resolved by the Gateway and delivered
       via ``X-Credential-<serviceType>`` headers.  Zero network calls.
    2. **Explicit user_id** — passed directly to each method call.
    3. **ContextVar user_id** — set once per request by the Starlette
       middleware, used as a fallback when *user_id* is not passed.
    """

    def __init__(
        self,
        gateway_url: str | None = None,
        timeout: float = 30.0,
        settings: GatewaySettings | None = None,
    ):
        cfg = settings or get_settings()
        resolved_url = gateway_url or f"{cfg.gateway_api_url}/api"
        self.gateway_url = resolved_url.rstrip("/")
        self.timeout = timeout

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_user_id(user_id: str | None) -> str | None:
        return user_id if user_id is not None else _current_user_id.get()

    def _headers(self, user_id: str | None = None) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if user_id:
            headers["X-User-Id"] = user_id
        return headers

    # ------------------------------------------------------------------
    # Middleware
    # ------------------------------------------------------------------

    def starlette_middleware(self):
        """Return a Starlette middleware that extracts user ID and credentials."""
        from starlette.middleware.base import BaseHTTPMiddleware

        _X_CREDENTIAL_PREFIX = "x-credential-"

        class _CredentialMiddleware(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                uid = request.headers.get("x-user-id")
                if uid:
                    set_user_id(uid)

                creds: dict[str, str] = {}
                for key, value in request.headers.items():
                    lower_key = key.lower()
                    if lower_key.startswith(_X_CREDENTIAL_PREFIX):
                        service_type = lower_key[len(_X_CREDENTIAL_PREFIX) :]
                        creds[service_type] = value
                if creds:
                    set_injected_credentials(creds)

                return await call_next(request)

        return _CredentialMiddleware

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def resolve(
        self, service_types: list[str], user_id: str | None = None
    ) -> CredentialResolveResult:
        """Resolve credentials for one or more service types."""
        injected = _injected_credentials.get()
        if injected:
            found: dict[str, str] = {}
            still_needed: list[str] = []
            for st in service_types:
                if st in injected:
                    found[st] = injected[st]
                else:
                    still_needed.append(st)

            if not still_needed:
                return CredentialResolveResult(
                    credentials=found, missing=[], auth_urls={}
                )

            if still_needed and found:
                result = await self._resolve_via_api(still_needed, user_id)
                result.credentials.update(found)
                return result

        return await self._resolve_via_api(service_types, user_id)

    async def get_credential(
        self, service_type: str, user_id: str | None = None
    ) -> str:
        """Get a single credential, raising if not found."""
        injected = _injected_credentials.get()
        if injected and service_type in injected:
            return injected[service_type]

        result = await self.resolve([service_type], user_id=user_id)

        if service_type in result.missing:
            auth_url = result.auth_urls.get(service_type, "")
            if auth_url:
                raise AuthenticationRequiredError(service_type, auth_url)
            raise CredentialNotFoundError(service_type)

        return result.credentials[service_type]

    async def get_credential_or_none(
        self, service_type: str, user_id: str | None = None
    ) -> Optional[str]:
        """Get a single credential, returning None if not found."""
        try:
            return await self.get_credential(service_type, user_id=user_id)
        except (CredentialNotFoundError, AuthenticationRequiredError):
            return None

    async def has_credential(
        self, service_type: str, user_id: str | None = None
    ) -> bool:
        """Check if a credential exists for a service type."""
        injected = _injected_credentials.get()
        if injected and service_type in injected:
            return True
        result = await self.check(service_type, user_id=user_id)
        return result.has_credential

    async def check(
        self, service_type: str, user_id: str | None = None
    ) -> CredentialCheckResult:
        """Check credential status for a service type."""
        effective_user_id = self._resolve_user_id(user_id)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.gateway_url}/v1/credentials/check/{service_type}",
                headers=self._headers(effective_user_id),
            )

            if response.status_code != 200:
                error_data = (
                    response.json()
                    if response.headers.get("content-type", "").startswith(
                        "application/json"
                    )
                    else {}
                )
                raise ApiError(
                    error_data.get(
                        "error",
                        f"Failed to check credential: {response.status_code}",
                    ),
                    response.status_code,
                    error_data,
                )

            data = response.json()
            return CredentialCheckResult(
                has_credential=data.get("hasCredential", False),
                credential=data.get("credential"),
                auth_url=data.get("authUrl"),
                provider=data.get("provider"),
            )

    async def get_auth_url(
        self, service_type: str, user_id: str | None = None
    ) -> Optional[str]:
        """Get the auth URL for a service type."""
        result = await self.check(service_type, user_id=user_id)
        return result.auth_url

    async def list_credentials(
        self, user_id: str | None = None
    ) -> list[CredentialInfo]:
        """List all credentials for a user."""
        effective_user_id = self._resolve_user_id(user_id)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.gateway_url}/v1/credentials",
                headers=self._headers(effective_user_id),
            )

            if response.status_code != 200:
                error_data = (
                    response.json()
                    if response.headers.get("content-type", "").startswith(
                        "application/json"
                    )
                    else {}
                )
                raise ApiError(
                    error_data.get(
                        "error",
                        f"Failed to list credentials: {response.status_code}",
                    ),
                    response.status_code,
                    error_data,
                )

            data = response.json()
            return [
                CredentialInfo(
                    id=c["id"],
                    service_type=c["serviceType"],
                    provider_name=c["providerName"],
                    scopes=c.get("scopes"),
                    expires_at=c.get("expiresAt"),
                    has_refresh_token=c.get("hasRefreshToken", False),
                    created_at=c.get("createdAt"),
                    updated_at=c.get("updatedAt"),
                )
                for c in data.get("credentials", [])
            ]

    async def require_all(
        self, service_types: list[str], user_id: str | None = None
    ) -> dict[str, str]:
        """Resolve all required credentials, raising if any are missing."""
        result = await self.resolve(service_types, user_id=user_id)

        if result.missing:
            raise MultipleCredentialsMissingError(result.missing, result.auth_urls)

        return result.credentials

    def create_needs_auth_response(
        self, service_type: str, auth_url: str, message: str | None = None
    ) -> dict:
        """Create a 'needs auth' response for returning from tool handlers."""
        return {
            "needsAuth": True,
            "serviceType": service_type,
            "authUrl": auth_url,
            "message": message or f"Authentication required for {service_type}",
        }

    # ------------------------------------------------------------------
    # Private: API resolution
    # ------------------------------------------------------------------

    async def _resolve_via_api(
        self, service_types: list[str], user_id: str | None = None
    ) -> CredentialResolveResult:
        effective_user_id = self._resolve_user_id(user_id)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.gateway_url}/v1/credentials/resolve",
                headers=self._headers(effective_user_id),
                json={"serviceTypes": service_types},
            )

            if response.status_code != 200:
                error_data = (
                    response.json()
                    if response.headers.get("content-type", "").startswith(
                        "application/json"
                    )
                    else {}
                )
                raise ApiError(
                    error_data.get(
                        "error",
                        f"Failed to resolve credentials: {response.status_code}",
                    ),
                    response.status_code,
                    error_data,
                )

            data = response.json()
            return CredentialResolveResult(
                credentials=data.get("credentials", {}),
                missing=data.get("missing", []),
                auth_urls=data.get("authUrls", {}),
            )


def create_credential_client(
    gateway_url: str | None = None,
    timeout: float = 30.0,
    settings: GatewaySettings | None = None,
) -> CredentialClient:
    """Create a new CredentialClient instance.

    Args:
        gateway_url: Base URL of the Gateway API.  Defaults to
            ``GATEWAY_API_URL`` from env + ``/api``.
        timeout: HTTP request timeout in seconds.
        settings: Custom ``GatewaySettings`` instance.
    """
    return CredentialClient(
        gateway_url=gateway_url,
        timeout=timeout,
        settings=settings,
    )
