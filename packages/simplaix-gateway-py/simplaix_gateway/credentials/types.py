"""Type definitions for the Credential SDK."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CredentialResolveResult:
    """Result of resolving credentials for one or more service types."""

    credentials: dict[str, str] = field(default_factory=dict)
    """Map of serviceType to credential token."""

    missing: list[str] = field(default_factory=list)
    """List of service types that are missing credentials."""

    auth_urls: dict[str, str] = field(default_factory=dict)
    """Map of serviceType to auth URL for missing credentials."""


@dataclass
class CredentialInfo:
    """Information about a user's credential (without the actual token)."""

    id: str
    service_type: str
    provider_name: str
    scopes: Optional[list[str]] = None
    expires_at: Optional[str] = None
    has_refresh_token: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class CredentialCheckResult:
    """Result of checking if a credential exists."""

    has_credential: bool
    credential: Optional[dict] = None
    auth_url: Optional[str] = None
    provider: Optional[dict] = None
