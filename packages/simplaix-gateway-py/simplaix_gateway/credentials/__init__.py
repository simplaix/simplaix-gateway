"""Simplaix Gateway Credential SDK — Access user credentials from the Gateway.

Usage::

    from simplaix_gateway.credentials import create_credential_client

    # Reads GATEWAY_API_URL from env / .env automatically
    client = create_credential_client()

    result = await client.resolve(["gateway_api"], user_id="user_123")
"""

from .client import (
    CredentialClient,
    create_credential_client,
    set_user_id,
    get_user_id,
    set_injected_credentials,
    get_injected_credentials,
)
from .types import CredentialResolveResult, CredentialInfo, CredentialCheckResult
from .errors import (
    CredentialError,
    AuthenticationRequiredError,
    CredentialNotFoundError,
    CredentialExpiredError,
    ApiError,
    MultipleCredentialsMissingError,
)

__all__ = [
    "CredentialClient",
    "create_credential_client",
    "set_user_id",
    "get_user_id",
    "set_injected_credentials",
    "get_injected_credentials",
    "CredentialResolveResult",
    "CredentialInfo",
    "CredentialCheckResult",
    "CredentialError",
    "AuthenticationRequiredError",
    "CredentialNotFoundError",
    "CredentialExpiredError",
    "ApiError",
    "MultipleCredentialsMissingError",
]
