"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import { AuditTable, AuditLog } from "@/components/audit/audit-table";
import { AuditStatsGrid, AuditStats } from "@/components/audit/audit-stats";
import { AuditDetailSheet } from "@/components/audit/audit-detail-sheet";
import { DashboardState, initialDashboardState } from "@/types";
import * as api from "@/lib/gateway-api";

interface AuditTabProps {
  state: DashboardState;
  setState: (newState: DashboardState | ((prevState: DashboardState | undefined) => DashboardState)) => void;
}

// Fetcher function for audit logs
const fetchAuditLogs = async (): Promise<AuditLog[]> => {
  const result = await api.getAuditLogs({ limit: 50 });
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch audit logs");
  }
  return result.data.logs;
};

// Fetcher function for audit stats
const fetchAuditStats = async (): Promise<AuditStats | null> => {
  const result = await api.getAuditStats();
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch audit stats");
  }
  return result.data;
};

export function AuditTab({ state, setState }: AuditTabProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Use SWR for fetching audit logs
  const { data: logs, isLoading: logsLoading, mutate: mutateLogs } = useSWR("audit-logs", fetchAuditLogs, {
    fallbackData: state.auditLogs,
    onSuccess: (data) => {
      setState(prev => ({
        ...initialDashboardState,
        ...prev,
        auditLogs: data,
      }));
    },
  });

  // Use SWR for fetching audit stats
  const { data: stats, isLoading: statsLoading, mutate: mutateStats } = useSWR("audit-stats", fetchAuditStats, {
    fallbackData: state.auditStats,
    onSuccess: (data) => {
      setState(prev => ({
        ...initialDashboardState,
        ...prev,
        auditStats: data,
      }));
    },
  });

  const isLoading = logsLoading || statsLoading;

  const handleRefresh = () => {
    mutateLogs();
    mutateStats();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-[var(--ink-primary)]">Audit Dashboard</h2>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
          <RefreshIcon size={16} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>
      
      <div>
        <h3 className="text-md font-medium text-[var(--ink-primary)] mb-4">Statistics</h3>
        <AuditStatsGrid stats={stats ?? null} loading={statsLoading} />
      </div>
      
      <div>
        <h3 className="text-md font-medium text-[var(--ink-primary)] mb-4">Recent Activity</h3>
        <AuditTable logs={logs ?? []} loading={logsLoading} onSelect={setSelectedLog} />
      </div>

      <AuditDetailSheet
        log={selectedLog}
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}
