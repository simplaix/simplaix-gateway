import base64
import hashlib
import hmac
import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from dotenv import load_dotenv

load_dotenv()

GATEWAY_API_URL = os.getenv("GATEWAY_API_URL", "http://localhost:3001").rstrip("/")
GATEWAY_AGENT_ID = os.getenv("GATEWAY_AGENT_ID", "")
CLIENT_JWT_SECRET = os.getenv("CLIENT_JWT_SECRET", "")
CLIENT_JWT_ISSUER = os.getenv("CLIENT_JWT_ISSUER", "https://my-client-app.example.com")
GATEWAY_USER_JWT = os.getenv("GATEWAY_USER_JWT", "")
USER_MESSAGE = os.getenv(
    "USER_MESSAGE",
    "Please list available MCP tools, then call one relevant tool and summarize the result.",
)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_test_user_jwt(
    secret: str,
    *,
    user_id: str = "+33769142022",
    email: str = "test-user@example.com",
    tenant_id: str = "+33769142022",
    roles: list[str] | None = None,
    issuer: str = CLIENT_JWT_ISSUER,
    expires_in_seconds: int = 86400,
) -> str:
    """Create a HS256 JWT mimicking an external client application's user token.

    The gateway must have this issuer configured in JWT_EXTERNAL_ISSUERS, e.g.:
      JWT_EXTERNAL_ISSUERS='[{"issuer":"https://my-client-app.example.com","secret":"<same-secret>"}]'
    """
    if roles is None:
        roles = ["user"]

    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())

    now = int(time.time())
    payload = _b64url_encode(
        json.dumps(
            {
                "sub": user_id,
                "email": email,
                "tenant_id": tenant_id,
                "roles": roles,
                "iss": issuer,
                "iat": now,
                "exp": now + expires_in_seconds,
            }
        ).encode()
    )

    signing_input = f"{header}.{payload}"
    signature = _b64url_encode(
        hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    )
    return f"{signing_input}.{signature}"


def pretty_print_response(raw: str) -> None:
    try:
        parsed = json.loads(raw)
        print(json.dumps(parsed, ensure_ascii=True, indent=2))
    except json.JSONDecodeError:
        print(raw)


def main() -> int:
    if not GATEWAY_AGENT_ID:
        print("Missing env: GATEWAY_AGENT_ID")
        return 1

    token = GATEWAY_USER_JWT
    if not token:
        if not CLIENT_JWT_SECRET:
            print("Missing env: set GATEWAY_USER_JWT or CLIENT_JWT_SECRET")
            return 1
        token = create_test_user_jwt(CLIENT_JWT_SECRET)
        print(f"Generated test JWT: {token}...")

    url = f"{GATEWAY_API_URL}/api/v1/agents/{GATEWAY_AGENT_ID}/invoke"
    payload = {"message": USER_MESSAGE}

    req = Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )

    try:
        with urlopen(req, timeout=600) as resp:
            body = resp.read().decode("utf-8")
            print(f"HTTP {resp.status}")
            pretty_print_response(body)
            return 0
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}")
        pretty_print_response(error_body)
        return 1
    except URLError as exc:
        print(f"Request failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
