"""Simplaix Gateway Management Agent.

This agent connects to the gateway's MCP server to manage:
- Agent management (CRUD, enable/disable)
- Tool provider management (CRUD)
- Access policy management (CRUD, evaluation)
- Approval management (list pending, approve/reject)
- Audit log viewing

All operations are delegated to the Gateway MCP Server via Streamable HTTP transport.
"""

import json
import logging
import os
from typing import Optional, List

from ag_ui_strands import (
    StrandsAgent,
    StrandsAgentConfig,
    ToolBehavior,
    create_strands_app,
)
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from simplaix_gateway.mcp import GatewayMCPTransport
from strands import Agent
from strands.models.openai import OpenAIModel
from strands.tools.mcp import MCPClient
from simplaix_gateway.middleware import GatewayMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s: %(message)s",
)
logging.getLogger("simplaix_gateway").setLevel(logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()


# ==================== Pydantic Models for State ====================

class DashboardState(BaseModel):
    """State model for the gateway dashboard."""
    agents: List[dict] = Field(default_factory=list)
    tool_providers: List[dict] = Field(default_factory=list)
    pending_approvals: List[dict] = Field(default_factory=list)
    audit_logs: List[dict] = Field(default_factory=list)
    selected_agent_id: Optional[str] = None
    active_tab: str = "agents"


# ==================== State Management ====================

def build_dashboard_prompt(input_data, user_message: str) -> str:
    """Inject the current dashboard state into the prompt."""
    state_dict = getattr(input_data, "state", None)
    if isinstance(state_dict, dict):
        context_parts = []

        if state_dict.get("agents"):
            agent_names = [a.get("name", a.get("id", "unknown")) for a in state_dict["agents"][:5]]
            context_parts.append(f"Current agents: {', '.join(agent_names)}")

        if state_dict.get("pending_approvals") or state_dict.get("pendingApprovals"):
            approvals = state_dict.get("pending_approvals") or state_dict.get("pendingApprovals") or []
            count = len(approvals)
            context_parts.append(f"Pending approvals: {count}")

        if state_dict.get("active_tab") or state_dict.get("activeTab"):
            tab = state_dict.get("active_tab") or state_dict.get("activeTab")
            context_parts.append(f"Active tab: {tab}")

        if context_parts:
            return f"Dashboard context: {'; '.join(context_parts)}\n\nUser request: {user_message}"

    return user_message


async def dashboard_state_from_args(context):
    """Extract dashboard state from tool arguments."""
    try:
        tool_input = context.tool_input
        if isinstance(tool_input, str):
            tool_input = json.loads(tool_input)

        # Handle different tool results
        if "agents" in tool_input:
            return {"agents": tool_input["agents"]}
        if "providers" in tool_input:
            return {"tool_providers": tool_input["providers"]}
        if "approvals" in tool_input:
            return {"pending_approvals": tool_input["approvals"]}

        return None
    except Exception:
        return None


# ==================== Agent Configuration ====================

shared_state_config = StrandsAgentConfig(
    state_context_builder=build_dashboard_prompt,
    tool_behaviors={
        # List tools update state with fetched data
        "list_agents": ToolBehavior(
            skip_messages_snapshot=True,
            state_from_args=dashboard_state_from_args,
        ),
        "list_tool_providers": ToolBehavior(
            skip_messages_snapshot=True,
            state_from_args=dashboard_state_from_args,
        ),
        "list_pending_approvals": ToolBehavior(
            skip_messages_snapshot=True,
            state_from_args=dashboard_state_from_args,
        ),
        # Mutation tools also include refreshed lists in response
        "create_agent": ToolBehavior(
            skip_messages_snapshot=True,
            state_from_args=dashboard_state_from_args,
        ),
        "update_agent": ToolBehavior(
            skip_messages_snapshot=True,
            state_from_args=dashboard_state_from_args,
        ),
        "delete_agent": ToolBehavior(
            skip_messages_snapshot=True,
            state_from_args=dashboard_state_from_args,
        ),
        "toggle_agent": ToolBehavior(
            skip_messages_snapshot=True,
            state_from_args=dashboard_state_from_args,
        ),
    },
)

# Initialize OpenAI model
api_key = os.getenv("OPENAI_API_KEY", "")
model = OpenAIModel(
    client_args={"api_key": api_key},
    model_id="gpt-5.2-2025-12-11",
)

system_prompt = """You are a gateway management assistant for the Simplaix Gateway.

You help users manage:
- **Agents**: Virtual identities that connect to upstream MCP servers
- **Tool Providers**: MCP server configurations that route tool calls by pattern
- **Access Policies**: Rules controlling who can access which providers and tools (allow/deny/require_approval)
- **Approvals**: Pending tool calls that require manual approval
- **Audit Logs**: History of all tool calls through the gateway

Key concepts:
- Each agent has one upstream URL pointing to an MCP server
- Agents can be enabled/disabled (kill switch) without deletion
- Tool providers match tool names using glob patterns (e.g., "slack_*")
- Higher priority providers match first
- Access policies define per-user/role rules for providers and tools with actions: allow, deny, or require_approval
- Policies can use glob patterns for tool names (e.g., "slack_send_*")

IMPORTANT - State Synchronization:
- After creating, updating, or deleting an agent, ALWAYS call list_agents to refresh the UI
- After creating, updating, or deleting a tool provider, ALWAYS call list_tool_providers to refresh
- After creating, updating, or deleting an access policy, ALWAYS call list_access_policies to refresh
- After approving or rejecting a request, ALWAYS call list_pending_approvals to refresh

IMPORTANT - Tool Approval Flow:
- Some tools may require human approval before execution (based on access policies)
- When this happens, the tool call will wait automatically until the user approves or rejects
- No retry or special handling is needed — the gateway holds the request and returns the result once resolved
- If rejected or timed out, the tool returns a message indicating the rejection
- approve_request, reject_request, and list_pending_approvals are ALWAYS allowed without approval

Always confirm destructive actions (delete) before executing.
"""

# MCP client — connects to the gateway via the unified MCP endpoint.
# The agent authenticates with its runtime token (AGENT_RUNTIME_TOKEN env var)
# and receives all tools it is authorized to access, aggregated from all providers.
gateway_mcp = MCPClient(GatewayMCPTransport())

# Create Strands agent with MCP tools (gracefully handle MCP connection failure)
# Frontend tools (navigate_to_tab, select_agent, refresh_dashboard, check_gateway_health)
# are injected by CopilotKit on the frontend side — not defined here.
try:
    strands_agent = Agent(
        model=model,
        system_prompt=system_prompt,
        tools=[gateway_mcp],
    )
except (ValueError, Exception) as e:
    logger.warning("Failed to load MCP tools from gateway, starting agent without MCP tools: %s", e)
    strands_agent = Agent(
        model=model,
        system_prompt=system_prompt,
        tools=[],
    )

# Wrap with AG-UI integration
agui_agent = StrandsAgent(
    agent=strands_agent,
    name="gateway_agent",
    description="Gateway management assistant for agents, providers, approvals, and audit logs",
    config=shared_state_config,
)

# Create the FastAPI app
agent_path = os.getenv("AGENT_PATH", "/")
app = create_strands_app(agui_agent, agent_path)

app.add_middleware(GatewayMiddleware)
if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("AGENT_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
