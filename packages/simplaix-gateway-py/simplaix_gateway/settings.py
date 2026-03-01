"""Centralized configuration loaded from environment variables.

Uses Pydantic ``BaseSettings`` so all env vars are validated, typed, and
available in one place.  A ``.env`` file is automatically loaded if present.

Usage::

    from simplaix_gateway.settings import get_settings

    settings = get_settings()
    print(settings.gateway_api_url)
    print(settings.agent_runtime_token)

Override per-instance::

    from simplaix_gateway.settings import GatewaySettings

    custom = GatewaySettings(gateway_api_url="http://custom:3001")
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class GatewaySettings(BaseSettings):
    """Simplaix Gateway environment configuration.

    All fields map to environment variables with the same uppercased name.
    For example, ``gateway_api_url`` reads from ``GATEWAY_API_URL``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gateway_api_url: str = "http://localhost:3001"
    """Base URL of the Simplaix Gateway (``GATEWAY_API_URL``)."""

    agent_runtime_token: str = ""
    """Runtime token for MCP proxy authentication (``AGENT_RUNTIME_TOKEN``)."""


def get_settings() -> GatewaySettings:
    """Create a new settings instance (reads env at call time)."""
    return GatewaySettings()
