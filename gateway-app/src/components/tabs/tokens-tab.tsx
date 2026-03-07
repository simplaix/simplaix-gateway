"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TokenIcon, PlusIcon, RefreshIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/dialog";
import { TokenList } from "@/components/tokens";
import { Token, NewToken } from "@/components/tokens/token-card";
import { TokenFormDialog } from "@/components/forms";
import { DashboardState, initialDashboardState } from "@/types";
import * as api from "@/lib/gateway-api";

interface TokensTabProps {
  state: DashboardState;
  setState: (newState: DashboardState | ((prevState: DashboardState | undefined) => DashboardState)) => void;
}

// Fetcher function for SWR
const fetchTokens = async (agentId: string) => {
  const result = await api.listTokens(agentId);
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch tokens");
  }
  return result.data.tokens;
};

// Fetcher function for agents
const fetchAgents = async () => {
  const result = await api.listAgents();
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch agents");
  }
  return result.data.agents;
};

export function TokensTab({ state, setState }: TokensTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [tokenToRevoke, setTokenToRevoke] = useState<Token | null>(null);
  const [tokenToRotate, setTokenToRotate] = useState<Token | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [newTokenIds, setNewTokenIds] = useState<Set<string>>(new Set());

  // Use SWR for fetching agents
  const { data: agents = [], isLoading: agentsLoading } = useSWR("agents", fetchAgents, {
    fallbackData: state.agents,
    onSuccess: (data) => {
      setState(prev => ({
        ...initialDashboardState,
        ...prev,
        agents: data,
      }));
    },
  });

  // Use SWR for fetching tokens (only when an agent is selected)
  const { data: tokens = [], isLoading: tokensLoading, mutate: mutateTokens } = useSWR(
    state.selectedAgentId ? `tokens-${state.selectedAgentId}` : null,
    () => state.selectedAgentId ? fetchTokens(state.selectedAgentId) : [],
    {
      fallbackData: state.tokens?.filter(t => t.agentId === state.selectedAgentId) || [],
      onSuccess: (data) => {
        setState(prev => ({
          ...initialDashboardState,
          ...prev,
          tokens: data,
          loading: { ...initialDashboardState.loading, ...prev?.loading, tokens: false },
        }));
      },
    }
  );

  const selectedAgent = agents.find(a => a.id === state.selectedAgentId);
  const hasAgents = agents.length > 0;

  // Handle agent selection change
  const handleAgentChange = (agentId: string) => {
    setState(prev => ({
      ...initialDashboardState,
      ...prev,
      selectedAgentId: agentId,
    }));
  };

  // Create token
  const handleCreateToken = async (data: { name: string; expiresInDays: number | null; agentId: string }) => {
    if (!data.agentId) return;
    
    setActionLoading(true);
    const result = await api.createToken(data.agentId, {
      name: data.name,
      expiresInDays: data.expiresInDays ?? undefined,
    });
    setActionLoading(false);
    
    if (result.success && result.data) {
      setFormOpen(false);
      
      // The token API returns { token: "sk_xxx", tokenRecord: {...} }
      const tokenResponse = result.data as unknown as { 
        token: string; 
        tokenRecord: {
          id: string;
          agentId: string;
          tokenPrefix: string;
          name: string;
          isActive: boolean;
          createdAt: string;
          expiresAt?: string;
        };
      };
      
      // Construct the NewToken object
      const newToken: NewToken = {
        ...tokenResponse.tokenRecord,
        token: tokenResponse.token,
      };
      
      setNewTokenIds(prev => new Set(prev).add(newToken.id));
      
      // If the token was created for a different agent, switch to that agent
      if (data.agentId !== state.selectedAgentId) {
        setState(prev => ({
          ...initialDashboardState,
          ...prev,
          selectedAgentId: data.agentId,
        }));
      }
      
      // Refresh tokens
      await mutateTokens();
    } else {
      console.error("Failed to create token:", result.error);
    }
  };

  // Revoke token
  const handleRevoke = async () => {
    if (!tokenToRevoke) return;
    
    setActionLoading(true);
    const result = await api.revokeToken(tokenToRevoke.id);
    setActionLoading(false);
    
    if (result.success) {
      setRevokeConfirmOpen(false);
      setTokenToRevoke(null);
      await mutateTokens();
    } else {
      console.error("Failed to revoke token:", result.error);
    }
  };

  // Rotate token
  const handleRotate = async () => {
    if (!tokenToRotate) return;
    
    setActionLoading(true);
    const result = await api.rotateToken(tokenToRotate.id);
    setActionLoading(false);
    
    if (result.success && result.data) {
      setRotateConfirmOpen(false);
      setTokenToRotate(null);
      
      // The token API returns { token: "sk_xxx", tokenRecord: {...} }
      const tokenResponse = result.data as unknown as { 
        token: string; 
        tokenRecord: {
          id: string;
          agentId: string;
          tokenPrefix: string;
          name: string;
          isActive: boolean;
          createdAt: string;
          expiresAt?: string;
        };
      };
      
      // Construct the NewToken object
      const newToken: NewToken = {
        ...tokenResponse.tokenRecord,
        token: tokenResponse.token,
      };
      
      // Add the new token to newTokenIds to highlight it
      setNewTokenIds(prev => new Set(prev).add(newToken.id));
      await mutateTokens();
    } else {
      console.error("Failed to rotate token:", result.error);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-[var(--ink-primary)]">Access Tokens</h2>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => mutateTokens()} 
              disabled={tokensLoading || !selectedAgent}
            >
              <RefreshIcon size={16} className={tokensLoading ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => setFormOpen(true)}
              disabled={!hasAgents}
              title={!hasAgents ? "Create an agent first" : undefined}
            >
              <PlusIcon size={16} />
              Create Token
            </Button>
          </div>
        </div>

        {/* Agent Selector */}
        <div className="mb-4">
          <label className="text-sm font-medium text-[var(--ink-secondary)] mb-1.5 block">
            Select Agent
          </label>
          <Select
            value={state.selectedAgentId || ""}
            onValueChange={handleAgentChange}
            disabled={!hasAgents || agentsLoading}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder={hasAgents ? "Select an agent..." : "No agents available"} />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {!selectedAgent ? (
          <Card>
            <CardContent className="p-8 text-center">
              <TokenIcon size={40} className="mx-auto mb-4 text-[var(--ink-muted)]" />
              <p className="text-[var(--ink-secondary)] mb-2">Select an agent to view its tokens</p>
              <p className="text-sm text-[var(--ink-tertiary)]">
                Choose an agent from the dropdown above to manage its access tokens.
              </p>
            </CardContent>
          </Card>
        ) : (
          <TokenList
            tokens={tokens}
            loading={tokensLoading}
            onRevoke={(token: Token) => {
              setTokenToRevoke(token);
              setRevokeConfirmOpen(true);
            }}
            onRotate={(token: Token) => {
              setTokenToRotate(token);
              setRotateConfirmOpen(true);
            }}
            newTokenIds={newTokenIds}
          />
        )}
      </div>

      {/* Create Token Dialog */}
      <TokenFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreateToken}
        agents={agents}
        selectedAgentId={state.selectedAgentId}
        loading={actionLoading}
      />

      {/* Revoke Confirmation */}
      <ConfirmDialog
        open={revokeConfirmOpen}
        onClose={() => {
          setRevokeConfirmOpen(false);
          setTokenToRevoke(null);
        }}
        onConfirm={handleRevoke}
        title="Revoke Token"
        description={`Are you sure you want to revoke "${tokenToRevoke?.name}"? This token will no longer work for API authentication. This action cannot be undone.`}
        confirmLabel="Revoke Token"
        confirmVariant="danger"
        loading={actionLoading}
      />

      {/* Rotate Confirmation */}
      <ConfirmDialog
        open={rotateConfirmOpen}
        onClose={() => {
          setRotateConfirmOpen(false);
          setTokenToRotate(null);
        }}
        onConfirm={handleRotate}
        title="Rotate Token"
        description={`Are you sure you want to rotate "${tokenToRotate?.name}"? The current token will be revoked and a new one will be generated. Make sure to update any services using this token.`}
        confirmLabel="Rotate Token"
        confirmVariant="primary"
        loading={actionLoading}
      />
    </div>
  );
}
