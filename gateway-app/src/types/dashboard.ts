import { Agent } from "@/components/agents/agent-card";
import { ToolProvider } from "@/components/providers/provider-card";
import { Confirmation } from "@/components/confirmations/confirmation-card";
import { AuditLog } from "@/components/audit/audit-table";
import { AuditStats } from "@/components/audit/audit-stats";

export interface DashboardState {
  agents: Agent[];
  toolProviders: ToolProvider[];
  pendingConfirmations: Confirmation[];
  auditLogs: AuditLog[];
  auditStats: AuditStats | null;
  selectedAgentId: string | null;
  activeTab: string;
  loading: {
    agents: boolean;
    providers: boolean;
    confirmations: boolean;
    audit: boolean;
  };
}

export const initialDashboardState: DashboardState = {
  agents: [],
  toolProviders: [],
  pendingConfirmations: [],
  auditLogs: [],
  auditStats: null,
  selectedAgentId: null,
  activeTab: "agents",
  loading: {
    agents: false,
    providers: false,
    confirmations: false,
    audit: false,
  },
};
