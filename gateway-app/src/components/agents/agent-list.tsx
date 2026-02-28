"use client";

import { AgentCard, AgentCardSkeleton, Agent } from "./agent-card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { AgentIcon } from "@/components/ui/icons";

interface AgentListProps {
  agents: Agent[];
  loading?: boolean;
  onSelectAgent?: (agent: Agent) => void;
  onToggleAgent?: (agent: Agent) => void;
  onDeleteAgent?: (agent: Agent) => void;
  onEditAgent?: (agent: Agent) => void;
  onRegenerateToken?: (agent: Agent) => void;
  onConfigureProviders?: (agent: Agent) => void;
  compact?: boolean;
}

export function AgentList({ 
  agents, 
  loading, 
  onSelectAgent, 
  onToggleAgent, 
  onDeleteAgent,
  onEditAgent,
  onRegenerateToken,
  onConfigureProviders,
  compact 
}: AgentListProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <AgentCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AgentIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>No agents configured</EmptyTitle>
          <EmptyDescription>Create an agent to route requests to your MCP servers.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onSelect={onSelectAgent}
            compact
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onSelect={onSelectAgent}
          onToggle={onToggleAgent}
          onDelete={onDeleteAgent}
          onEdit={onEditAgent}
          onRegenerateToken={onRegenerateToken}
          onConfigureProviders={onConfigureProviders}
        />
      ))}
    </div>
  );
}
