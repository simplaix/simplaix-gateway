"use client";

import { useState } from "react";
import useSWR from "swr";
import { AgentList } from "@/components/agents";
import { Agent } from "@/components/agents/agent-card";
import { AgentDetailPanel } from "@/components/agents/agent-detail-panel";
import { AgentFormDialog } from "@/components/forms";
import { SimpleDialog, ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlusIcon, RefreshIcon, CopyIcon, AlertIcon } from "@/components/ui/icons";
import { DashboardState, initialDashboardState } from "@/types";
import * as api from "@/lib/gateway-api";

interface AgentsTabProps {
  state: DashboardState;
  setState: (newState: DashboardState | ((prevState: DashboardState | undefined) => DashboardState)) => void;
}

// Fetcher function for SWR
const fetchAgents = async () => {
  const result = await api.listAgents();
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch agents");
  }
  return result.data.agents;
};

export function AgentsTab({ state, setState }: AgentsTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const [agentToToggle, setAgentToToggle] = useState<Agent | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Runtime token dialog state
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenDialogData, setTokenDialogData] = useState<{ agentName: string; token: string } | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  // Regenerate token confirmation
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const [agentToRegen, setAgentToRegen] = useState<Agent | null>(null);
  // Detail panel
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Use SWR for fetching agents
  const { data: agents, isLoading, mutate } = useSWR("agents", fetchAgents, {
    fallbackData: state.agents,
    onSuccess: (data) => {
      setState(prev => ({
        ...initialDashboardState,
        ...prev,
        agents: data,
        loading: { ...initialDashboardState.loading, ...prev?.loading, agents: false },
      }));
    },
  });

  // Create or update agent
  const handleSubmit = async (data: {
    name: string;
    upstreamUrl: string;
    description: string;
    requireConfirmation: boolean;
  }) => {
    setActionLoading(true);
    
    if (editingAgent) {
      const result = await api.updateAgent(editingAgent.id, {
        name: data.name,
        upstreamUrl: data.upstreamUrl,
        description: data.description || undefined,
        requireConfirmation: data.requireConfirmation,
      });

      if (result.success && result.data) {
        setFormOpen(false);
        setEditingAgent(null);
        await mutate();
      } else {
        console.error("Failed to update agent:", result.error);
      }
    } else {
      const result = await api.createAgent({
        name: data.name,
        upstreamUrl: data.upstreamUrl,
        description: data.description || undefined,
        requireConfirmation: data.requireConfirmation,
      });

      if (result.success && result.data) {
        setFormOpen(false);
        setEditingAgent(null);
        await mutate();

        // Show the runtime token dialog (token is only shown once!)
        const runtimeToken = result.data.runtime_token;
        if (runtimeToken) {
          setTokenDialogData({ agentName: data.name, token: runtimeToken });
          setTokenCopied(false);
          setTokenDialogOpen(true);
        }
      } else {
        console.error("Failed to create agent:", result.error);
      }
    }
    
    setActionLoading(false);
  };

  // Regenerate runtime token
  const handleRegenerateToken = async () => {
    if (!agentToRegen) return;

    setActionLoading(true);
    const result = await api.regenerateAgentToken(agentToRegen.id);
    setActionLoading(false);

    if (result.success && result.data) {
      setRegenConfirmOpen(false);

      // Show the new token
      setTokenDialogData({ agentName: agentToRegen.name, token: result.data.runtime_token });
      setTokenCopied(false);
      setTokenDialogOpen(true);
      setAgentToRegen(null);
      await mutate();
    } else {
      console.error("Failed to regenerate token:", result.error);
    }
  };

  const copyToken = async () => {
    if (tokenDialogData?.token) {
      await navigator.clipboard.writeText(tokenDialogData.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };
  
  // Delete agent
  const handleDelete = async () => {
    if (!agentToDelete) return;
    
    setActionLoading(true);
    const result = await api.deleteAgent(agentToDelete.id);
    setActionLoading(false);
    
    if (result.success) {
      setDeleteConfirmOpen(false);
      setAgentToDelete(null);
      await mutate();
    } else {
      console.error("Failed to delete agent:", result.error);
    }
  };

  // Toggle agent
  const handleToggle = async () => {
    if (!agentToToggle) return;
    
    setActionLoading(true);
    const result = agentToToggle.isActive
      ? await api.disableAgent(agentToToggle.id)
      : await api.enableAgent(agentToToggle.id);
    setActionLoading(false);
    
    if (result.success) {
      setToggleConfirmOpen(false);
      setAgentToToggle(null);
      await mutate();
    } else {
      console.error("Failed to toggle agent:", result.error);
    }
  };

  if (selectedAgent) {
    return (
      <AgentDetailPanel
        agent={selectedAgent}
        onBack={() => setSelectedAgent(null)}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-[var(--ink-primary)]">Registered Agents</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => mutate()} disabled={isLoading}>
            <RefreshIcon size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button variant="default" size="sm" onClick={() => setFormOpen(true)}>
            <PlusIcon size={16} />
            Create Agent
          </Button>
        </div>
      </div>
      
      <AgentList
        agents={agents ?? []}
        loading={isLoading}
        onSelectAgent={(agent: Agent) => setSelectedAgent(agent)}
        onToggleAgent={(agent: Agent) => {
          setAgentToToggle(agent);
          setToggleConfirmOpen(true);
        }}
        onDeleteAgent={(agent: Agent) => {
          setAgentToDelete(agent);
          setDeleteConfirmOpen(true);
        }}
        onEditAgent={(agent: Agent) => {
          setEditingAgent(agent);
          setFormOpen(true);
        }}
        onRegenerateToken={(agent: Agent) => {
          setAgentToRegen(agent);
          setRegenConfirmOpen(true);
        }}
        onConfigureProviders={(agent: Agent) => setSelectedAgent(agent)}
      />

      {/* Create/Edit Dialog */}
      <AgentFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingAgent(null);
        }}
        onSubmit={handleSubmit}
        agent={editingAgent}
        loading={actionLoading}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setAgentToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Delete Agent"
        description={`Are you sure you want to delete "${agentToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete Agent"
        confirmVariant="danger"
        loading={actionLoading}
      />

      {/* Toggle Confirmation */}
      <ConfirmDialog
        open={toggleConfirmOpen}
        onClose={() => {
          setToggleConfirmOpen(false);
          setAgentToToggle(null);
        }}
        onConfirm={handleToggle}
        title={agentToToggle?.isActive ? "Disable Agent" : "Enable Agent"}
        description={
          agentToToggle?.isActive
            ? `Are you sure you want to disable "${agentToToggle?.name}"? The agent will not be able to make any tool calls.`
            : `Are you sure you want to enable "${agentToToggle?.name}"?`
        }
        confirmLabel={agentToToggle?.isActive ? "Disable" : "Enable"}
        confirmVariant={agentToToggle?.isActive ? "danger" : "primary"}
        loading={actionLoading}
      />

      {/* Regenerate Token Confirmation */}
      <ConfirmDialog
        open={regenConfirmOpen}
        onClose={() => {
          setRegenConfirmOpen(false);
          setAgentToRegen(null);
        }}
        onConfirm={handleRegenerateToken}
        title="Regenerate Runtime Token"
        description={`This will invalidate the current runtime token for "${agentToRegen?.name}". Any agent runtime using the old token will lose access. Continue?`}
        confirmLabel="Regenerate Token"
        confirmVariant="danger"
        loading={actionLoading}
      />

      {/* Runtime Token Dialog (shown once after creation or regeneration) */}
      <SimpleDialog
        open={tokenDialogOpen}
        onClose={() => {
          setTokenDialogOpen(false);
          setTokenDialogData(null);
        }}
        title="Agent Runtime Token"
        description={`Runtime token for "${tokenDialogData?.agentName}"`}
      >
        <div className="space-y-3">
          <div className="p-3 bg-[var(--surface-sunken)] rounded-[var(--radius-md)] border border-[var(--border-default)]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-[var(--signal-warning)]">
                <AlertIcon size={12} className="inline mr-1" />
                Save this token — it won&apos;t be shown again!
              </span>
              <Button variant="ghost" size="sm" onClick={copyToken}>
                <CopyIcon size={14} />
                {tokenCopied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <code className="text-sm font-mono text-[var(--ink-primary)] break-all select-all block">
              {tokenDialogData?.token}
            </code>
          </div>
          <p className="text-xs text-[var(--ink-tertiary)]">
            Use this token as <code className="text-[var(--ink-secondary)]">Authorization: Bearer art_xxx</code> when
            your agent calls the gateway MCP proxy.
          </p>
        </div>
      </SimpleDialog>

    </div>
  );
}
