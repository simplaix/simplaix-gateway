"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { useCallback } from "react";

// Auth
import { AuthGuard } from "@/components/auth";
import { useAuth } from "@/contexts/auth-context";

// UI Components
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AgentIcon,
  ProviderIcon,
  ConfirmationIcon,
  AuditIcon,
  KeyIcon,
  ShieldIcon,
  LogOutIcon,
} from "@/components/ui/icons";

// Tab Components
import {
  AgentsTab,
  ProvidersTab,
  ConfirmationsTab,
  AuditTab,
  ApiKeysTab,
  PoliciesTab,
} from "@/components/tabs";

// Hooks
import {
  useAgentTools,
  useProviderTools,
  useConfirmationTools,
  useAuditTools,
  usePolicyTools,
  useFrontendTools,
  useAuthAwareDefaultTool,
} from "@/hooks";

// Types
import { DashboardState, initialDashboardState } from "@/types";

function DashboardContent() {
  const { user, logout } = useAuth();
  
  // Shared state with the agent
  const { state: rawState, setState } = useCoAgent<DashboardState>({
    name: "gateway_agent",
    initialState: initialDashboardState,
  });

  // Ensure state is always defined with defaults
  const state: DashboardState = {
    ...initialDashboardState,
    ...rawState,
  };

  // Register all tool renderers
  useAgentTools(state);
  useProviderTools();
  useConfirmationTools();
  useAuditTools();
  usePolicyTools();
  useFrontendTools(setState);

  // Default tool renderer for tools without a custom renderer
  useAuthAwareDefaultTool();

  // Tab change handler
  const handleTabChange = useCallback(
    (tab: string) => {
      setState((prev) => ({ ...initialDashboardState, ...prev, activeTab: tab }));
    },
    [setState]
  );

  return (
    <div className="flex h-screen w-screen">
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--surface-ground)]">
        {/* Header */}
        <header className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[var(--ink-primary)]">
                Gateway Management
              </h1>
              <p className="text-sm text-[var(--ink-tertiary)]">
                Manage agents, credentials, and configurations
              </p>
            </div>
            <div className="flex items-center gap-3">
              {(state.pendingConfirmations?.filter(a => a.status === "pending").length ?? 0) > 0 && (
                <Badge variant="warning">
                  {state.pendingConfirmations?.filter(a => a.status === "pending").length} pending
                </Badge>
              )}
              <span className="text-sm text-[var(--ink-secondary)]">
                {user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOutIcon size={16} />
                Sign Out
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6">
          <Tabs defaultValue="agents" value={state.activeTab} onValueChange={handleTabChange}>
            <TabsList className="mb-6">
              <TabsTrigger value="agents">
                <AgentIcon size={16} />
                Agents
              </TabsTrigger>
              <TabsTrigger value="providers">
                <ProviderIcon size={16} />
                Providers
              </TabsTrigger>
              <TabsTrigger value="policies">
                <ShieldIcon size={16} />
                Policies
              </TabsTrigger>
              <TabsTrigger value="confirmations">
                <ConfirmationIcon size={16} />
                Confirmations
                {(state.pendingConfirmations?.filter(a => a.status === "pending").length ?? 0) > 0 && (
                  <Badge variant="warning" className="ml-1">
                    {state.pendingConfirmations?.filter(a => a.status === "pending").length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="api-keys">
                <KeyIcon size={16} />
                API Keys
              </TabsTrigger>
              <TabsTrigger value="audit">
                <AuditIcon size={16} />
                Audit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agents">
              <AgentsTab state={state} setState={setState} />
            </TabsContent>

            <TabsContent value="providers">
              <ProvidersTab state={state} setState={setState} />
            </TabsContent>

            <TabsContent value="policies">
              <PoliciesTab />
            </TabsContent>

            <TabsContent value="confirmations">
              <ConfirmationsTab state={state} setState={setState} />
            </TabsContent>

            <TabsContent value="api-keys">
              <ApiKeysTab />
            </TabsContent>

            <TabsContent value="audit">
              <AuditTab state={state} setState={setState} />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <CopilotSidebar
        clickOutsideToClose={false}
        defaultOpen={true}
        labels={{
          title: "Gateway Assistant",
          initial: "I can help you manage agents, tokens, tool providers, confirmations, and audit logs. What would you like to do?",
        }}
        suggestions={[
          {
            title: "List Agents",
            message: "Show me all registered agents",
          },
          {
            title: "Check Health",
            message: "Check the gateway health status",
          },
          {
            title: "Pending Confirmations",
            message: "Show pending confirmation requests",
          },
          {
            title: "Audit Logs",
            message: "Show recent audit logs",
          },
        ]}
      />
    </div>
  );
}

export default function GatewayDashboard() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
