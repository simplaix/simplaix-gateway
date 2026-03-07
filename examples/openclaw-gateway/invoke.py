#!/usr/bin/env python3
"""
Invoke an OpenClaw agent through the Simplaix Gateway.

Usage:
    python invoke.py
    python invoke.py "Analyze the code in src/"
"""

import base64, hashlib, hmac, json, os, sys, time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv

load_dotenv()

GW = os.getenv("GATEWAY_API_URL", "http://localhost:3001").rstrip("/")
AGENT_ID = os.getenv("GATEWAY_AGENT_ID", "")
TOKEN = os.getenv("GATEWAY_USER_JWT", "")
JWT_SECRET = os.getenv("CLIENT_JWT_SECRET", "")
JWT_ISSUER = os.getenv("CLIENT_JWT_ISSUER", "https://my-client-app.example.com")
DEFAULT_MSG = os.getenv("USER_MESSAGE", "What tools do you have?")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_jwt(secret: str) -> str:
    now = int(time.time())
    h = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = _b64url(json.dumps({
        "sub": "test-user-001", "email": "test@example.com",
        "tenant_id": "default", "roles": ["user"],
        "iss": JWT_ISSUER, "iat": now, "exp": now + 86400,
    }).encode())
    s = _b64url(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"


def stream_sse(resp):
    buf = ""
    for chunk in iter(lambda: resp.read(4096), b""):
        buf += chunk.decode("utf-8", errors="replace")
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            line = line.rstrip("\r")
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data.strip() == "[DONE]":
                print()
                return
            try:
                evt = json.loads(data)
            except json.JSONDecodeError:
                continue
            for c in evt.get("choices") or []:
                txt = (c.get("delta") or {}).get("content")
                if txt:
                    print(txt, end="", flush=True)
    print()


def main() -> int:
    if not AGENT_ID:
        print("ERROR: set GATEWAY_AGENT_ID in .env")
        return 1

    token = TOKEN
    if not token:
        if not JWT_SECRET:
            print("ERROR: set GATEWAY_USER_JWT or CLIENT_JWT_SECRET in .env")
            return 1
        token = make_jwt(JWT_SECRET)

    msg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MSG
    url = f"{GW}/api/v1/agents/{AGENT_ID}/invoke"

    print(f"[invoke] POST {url}")
    print(f"[invoke] {msg}\n")

    req = Request(url, json.dumps({
        "model": "openclaw",
        "messages": [{"role": "user", "content": msg}],
        "stream": True,
    }).encode(), headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "Accept": "text/event-stream",
    })

    try:
        resp = urlopen(req, timeout=600)
    except HTTPError as e:
        print(f"HTTP {e.code}")
        print(e.read().decode("utf-8", errors="replace"))
        return 1
    except URLError as e:
        print(f"Connection failed: {e}")
        return 1

    ct = resp.headers.get("Content-Type", "")
    if "text/event-stream" in ct:
        stream_sse(resp)
    else:
        raw = resp.read().decode("utf-8")
        try:
            print(json.dumps(json.loads(raw), indent=2, ensure_ascii=False))
        except json.JSONDecodeError:
            print(raw)
    return 0


if __name__ == "__main__":
    sys.exit(main())
