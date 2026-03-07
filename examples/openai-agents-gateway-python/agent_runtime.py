import json
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp
from simplaix_gateway.mcp import GatewayMCPTransport, default_headers_factory
from simplaix_gateway.middleware import GatewayMiddleware
from simplaix_gateway.settings import get_settings


load_dotenv()
SETTINGS = get_settings()

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
GATEWAY_PROVIDER_IDS = [
    item.strip()
    for item in os.getenv("GATEWAY_PROVIDER_IDS", "").split(",")
    if item.strip()
]

SYSTEM_PROMPT = (
    "You are a concise assistant. "
    "When MCP tools are available, use them before answering. "
    "If a tool call is denied by policy, explain what happened and suggest next steps."
)

app = FastAPI(title="OpenAI Agents SDK + Simplaix Gateway MCP Example")
app.add_middleware(GatewayMiddleware)


class InvokeResponse(BaseModel):
    output: str
    used_message: str


def extract_user_message(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("message", "input", "query", "prompt"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        messages = payload.get("messages")
        if isinstance(messages, list):
            for item in reversed(messages):
                if not isinstance(item, dict):
                    continue
                if item.get("role") != "user":
                    continue
                content = item.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
                if isinstance(content, list):
                    parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text = block.get("text")
                            if isinstance(text, str) and text.strip():
                                parts.append(text.strip())
                    if parts:
                        return "\n".join(parts)

    if isinstance(payload, str) and payload.strip():
        return payload.strip()

    return "Please inspect available MCP tools and provide a short summary."


def build_mcp_server() -> MCPServerStreamableHttp:
    # Use Simplaix SDK for URL + auth headers + request-scoped context headers.
    transport = GatewayMCPTransport(
        provider_id=GATEWAY_PROVIDER_IDS or None,
        settings=SETTINGS,
        headers_factory=default_headers_factory,
    )
    headers = dict(transport.headers)
    if transport.headers_factory:
        dynamic_headers = transport.headers_factory()
        if dynamic_headers:
            headers.update(dynamic_headers)
    return MCPServerStreamableHttp(
        params={
            "url": transport.url,
            "headers": headers,
        },
        name="simplaix-gateway-mcp",
        client_session_timeout_seconds=600,
    )


@app.get("/health")
def health() -> dict[str, Any]:
    transport = GatewayMCPTransport(
        provider_id=GATEWAY_PROVIDER_IDS or None,
        settings=SETTINGS,
        headers_factory=default_headers_factory,
    )
    return {
        "ok": True,
        "gateway_mcp_url": transport.url,
        "model": OPENAI_MODEL,
        "has_runtime_token": bool(SETTINGS.agent_runtime_token),
        "provider_mode": "selected" if GATEWAY_PROVIDER_IDS else "unified",
    }


@app.post("/", response_model=InvokeResponse)
async def invoke(
    request: Request,
) -> InvokeResponse:
    try:
        payload = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

    user_message = extract_user_message(payload)

    try:
        async with build_mcp_server() as mcp_server:
            agent = Agent(
                name="GatewayMCPAgent",
                instructions=SYSTEM_PROMPT,
                model=OPENAI_MODEL,
                mcp_servers=[mcp_server],
            )
            result = await Runner.run(agent, user_message)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Agent run failed: {exc}") from exc

    return InvokeResponse(
        output=str(result.final_output),
        used_message=user_message,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("agent_runtime:app", host="0.0.0.0", port=8000, reload=True)
