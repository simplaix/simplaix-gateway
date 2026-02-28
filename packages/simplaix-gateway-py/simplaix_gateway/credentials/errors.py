"""Custom error classes for the Credential SDK."""


class CredentialError(Exception):
    """Base error for credential SDK errors."""

    pass


class AuthenticationRequiredError(CredentialError):
    """Error when authentication is required for a service."""

    def __init__(self, service_type: str, auth_url: str, message: str | None = None):
        self.service_type = service_type
        self.auth_url = auth_url
        super().__init__(
            message or f"Authentication required for service: {service_type}"
        )


class CredentialNotFoundError(CredentialError):
    """Error when credential is not found."""

    def __init__(self, service_type: str):
        self.service_type = service_type
        super().__init__(f"Credential not found for service: {service_type}")


class CredentialExpiredError(CredentialError):
    """Error when credential has expired."""

    def __init__(self, service_type: str, auth_url: str | None = None):
        self.service_type = service_type
        self.auth_url = auth_url
        super().__init__(f"Credential expired for service: {service_type}")


class ApiError(CredentialError):
    """Error for API communication failures."""

    def __init__(self, message: str, status_code: int, response: dict | None = None):
        self.status_code = status_code
        self.response = response
        super().__init__(message)


class MultipleCredentialsMissingError(CredentialError):
    """Error when multiple credentials are missing."""

    def __init__(self, missing: list[str], auth_urls: dict[str, str]):
        self.missing = missing
        self.auth_urls = auth_urls
        super().__init__(f"Multiple credentials missing: {', '.join(missing)}")
