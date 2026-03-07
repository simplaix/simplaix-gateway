"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import { ConfirmationList } from "@/components/confirmations";
import { Confirmation } from "@/components/confirmations/confirmation-card";
import { DashboardState, initialDashboardState } from "@/types";
import * as api from "@/lib/gateway-api";

interface ConfirmationsTabProps {
  state: DashboardState;
  setState: (newState: DashboardState | ((prevState: DashboardState | undefined) => DashboardState)) => void;
}

// Fetcher function for SWR
const fetchConfirmations = async () => {
  const result = await api.listConfirmations();
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch confirmations");
  }
  return result.data.confirmations;
};

export function ConfirmationsTab({ state, setState }: ConfirmationsTabProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Use SWR for fetching confirmations with auto-refresh every 10 seconds
  const { data: confirmations, isLoading, mutate } = useSWR("confirmations", fetchConfirmations, {
    fallbackData: state.pendingConfirmations as Confirmation[] | undefined,
    refreshInterval: 10000, // Auto-refresh every 10 seconds for pending confirmations
    onSuccess: (data) => {
      setState(prev => ({
        ...initialDashboardState,
        ...prev,
        pendingConfirmations: data as any,
        loading: { ...initialDashboardState.loading, ...prev?.loading, confirmations: false },
      }));
    },
  });

  // Confirm request (API expects confirmationId, uses requestId or id)
  const handleConfirm = async (confirmation: Confirmation, reason?: string) => {
    const confirmationKey = confirmation.requestId || confirmation.id;
    setActionLoading(confirmation.id);
    const result = await api.confirmRequest(confirmationKey, reason);
    setActionLoading(null);

    if (result.success) {
      await mutate();
    } else {
      console.error("Failed to confirm request:", result.error);
    }
  };

  // Reject request (API expects confirmationId)
  const handleReject = async (confirmation: Confirmation, reason?: string) => {
    const confirmationKey = confirmation.requestId || confirmation.id;
    setActionLoading(confirmation.id);
    const result = await api.rejectRequest(confirmationKey, reason);
    setActionLoading(null);

    if (result.success) {
      await mutate();
    } else {
      console.error("Failed to reject request:", result.error);
    }
  };

  const pendingCount = (confirmations ?? []).filter(a => a.status === "pending").length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink-primary)]">Pending Confirmations</h2>
          <p className="text-sm text-[var(--ink-tertiary)]">
            {pendingCount > 0
              ? `${pendingCount} request${pendingCount > 1 ? 's' : ''} awaiting review`
              : "Review and confirm tool call requests"
            }
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => mutate()} disabled={isLoading}>
          <RefreshIcon size={16} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <ConfirmationList
        confirmations={confirmations ?? []}
        loading={isLoading}
        onConfirm={handleConfirm}
        onReject={handleReject}
        actionLoading={actionLoading}
      />
    </div>
  );
}
