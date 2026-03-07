import { Agent } from "@/components/agents/agent-card";
import { ToolProvider } from "@/components/providers/provider-card";
import { Confirmation } from "@/components/confirmations/confirmation-card";
import { AuditLog } from "@/components/audit/audit-table";
import { AuditStats } from "@/components/audit/audit-stats";
import { Token } from "@/components/tokens/token-card";

export interface DashboardState {
  agents: Agent[];
  toolProviders: ToolProvider[];
  pendingConfirmations: Confirmation[];
  auditLogs: AuditLog[];
  auditStats: AuditStats | null;
  tokens: Token[];
  selectedAgentId: string | null;
  activeTab: string;
  loading: {
    agents: boolean;
    providers: boolean;
    confirmations: boolean;
    audit: boolean;
    tokens: boolean;
  };
}

export const initialDashboardState: DashboardState = {
  agents: [],
  toolProviders: [],
  pendingConfirmations: [],
  auditLogs: [],
  auditStats: null,
  tokens: [],
  selectedAgentId: null,
  activeTab: "agents",
  loading: {
    agents: false,
    providers: false,
    confirmations: false,
    audit: false,
    tokens: false,
  },
};
