"use client";

import { useRenderToolCall } from "@copilotkit/react-core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AgentIcon } from "@/components/ui/icons";
import { AgentList } from "@/components/agents/agent-list";
import { Agent } from "@/components/agents/agent-card";
import { LoadingCard, SuccessCard, ErrorResult, isConfirmationRequired, ConfirmationRequiredCard } from "@/components/shared";
import { parseResult } from "@/lib/utils";
import { DashboardState } from "@/types";

export function useAgentTools(state: DashboardState) {
  useRenderToolCall(
    {
      name: "list_agents",
      parameters: [],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <AgentList agents={[]} loading />;
        }
        const data = parseResult(result);
        if (isConfirmationRequired(data)) {
          return <ConfirmationRequiredCard data={data!} />;
        }
        if (data?.agents && Array.isArray(data.agents)) {
          return (
            <Card className="my-2">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AgentIcon size={16} />
                  <span>Agents ({data.agents.length})</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <AgentList agents={data.agents} compact />
              </CardContent>
            </Card>
          );
        }
        return <ErrorResult result={result} />;
      },
    },
    [state]
  );

  useRenderToolCall(
    {
      name: "get_agent",
      parameters: [{ name: "agent_id", description: "Agent ID", required: true }],
      render: ({ status, result, args }) => {
        if (status === "executing") {
          return <LoadingCard title={`Loading agent ${args.agent_id}...`} />;
        }
        const data = parseResult(result);
        if (data?.agent) {
          const agent = data.agent as Agent;
          return (
            <Card className="my-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agent.isActive ? "bg-[var(--signal-success-muted)] text-[var(--signal-success)]" : "bg-[var(--surface-sunken)] text-[var(--ink-muted)]"}`}>
                    <span className="font-semibold">{agent.name.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs text-[var(--ink-tertiary)] font-mono">{agent.id}</div>
                  </div>
                </div>
                {agent.description && <p className="text-sm text-[var(--ink-secondary)] mb-2">{agent.description}</p>}
                <div className="text-xs text-[var(--ink-tertiary)] font-mono">{agent.upstreamUrl}</div>
              </CardContent>
            </Card>
          );
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );

  useRenderToolCall(
    {
      name: "create_agent",
      parameters: [
        { name: "name", description: "Agent name", required: true },
        { name: "upstream_url", description: "Upstream URL", required: true },
      ],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Creating agent..." />;
        }
        const data = parseResult(result);
        if (data?.success && data?.agent) {
          const agent = data.agent as { name: string };
          return <SuccessCard title="Agent Created" message={`"${agent.name}" is ready to use.`} />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );

  useRenderToolCall(
    {
      name: "toggle_agent",
      parameters: [
        { name: "agent_id", description: "Agent ID", required: true },
        { name: "enabled", description: "Enable or disable", required: true },
      ],
      render: ({ status, result, args }) => {
        if (status === "executing") {
          return <LoadingCard title={args.enabled ? "Enabling agent..." : "Disabling agent..."} />;
        }
        const data = parseResult(result);
        if (data?.success) {
          const message = data.message as string;
          return <SuccessCard title={args.enabled ? "Agent Enabled" : "Agent Disabled"} message={message} />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );

  useRenderToolCall(
    {
      name: "delete_agent",
      parameters: [{ name: "agent_id", description: "Agent ID", required: true }],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Deleting agent..." />;
        }
        const data = parseResult(result);
        if (data?.success) {
          return <SuccessCard title="Agent Deleted" message="The agent and all its tokens have been removed." variant="warning" />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );
}
