"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseResult } from "@/lib/utils";
import { confirmRequest, rejectRequest } from "@/lib/gateway-api";

export function LoadingCard({ title }: { title: string }) {
  return (
    <Card className="my-2">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[var(--ink-secondary)]">{title}</span>
      </CardContent>
    </Card>
  );
}

export function SuccessCard({
  title,
  message,
  variant = "success"
}: {
  title: string;
  message: string;
  variant?: "success" | "warning";
}) {
  const colors = variant === "success"
    ? "border-[var(--signal-success)] bg-[var(--signal-success-muted)]"
    : "border-[var(--signal-warning)] bg-[var(--signal-warning-muted)]";
  const textColor = variant === "success"
    ? "text-[var(--signal-success)]"
    : "text-[var(--signal-warning)]";

  return (
    <Card className={`my-2 ${colors}`}>
      <CardContent className="p-4">
        <div className={`font-medium ${textColor} mb-1`}>{title}</div>
        <div className="text-sm text-[var(--ink-secondary)]">{message}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Check if a parsed result is a confirmation_required response from the gateway.
 * Also supports legacy approval_required for backward compatibility.
 */
export function isConfirmationRequired(data: Record<string, unknown> | null): boolean {
  return data?.confirmation_required === true || data?.approval_required === true;
}

/**
 * Renders an inline confirmation-required card with Confirm / Reject buttons.
 * Calls the gateway confirmation REST API directly from the frontend.
 */
export function ConfirmationRequiredCard({ data }: { data: Record<string, unknown> }) {
  const risk = (data.risk as string) || "medium";
  const toolName = (data.toolName as string) || "unknown";
  const confirmationId = (data.confirmationId as string) || (data.approvalId as string) || "";

  const [status, setStatus] = useState<"pending" | "confirmed" | "rejected" | "loading">("pending");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!confirmationId) return;
    setStatus("loading");
    setError(null);
    const res = await confirmRequest(confirmationId);
    if (res.success) {
      setStatus("confirmed");
    } else {
      setError(res.error || "Failed to confirm");
      setStatus("pending");
    }
  };

  const handleReject = async () => {
    if (!confirmationId) return;
    setStatus("loading");
    setError(null);
    const res = await rejectRequest(confirmationId);
    if (res.success) {
      setStatus("rejected");
    } else {
      setError(res.error || "Failed to reject");
      setStatus("pending");
    }
  };

  if (status === "confirmed") {
    return (
      <Card className="my-2 border-[var(--signal-success)] bg-[var(--signal-success-muted)]">
        <CardContent className="p-4">
          <div className="font-medium text-[var(--signal-success)] mb-1">Confirmed</div>
          <div className="text-sm text-[var(--ink-secondary)]">
            Tool &quot;{toolName}&quot; has been confirmed. You can now ask the agent to retry.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "rejected") {
    return (
      <Card className="my-2 border-[var(--signal-danger)] bg-[var(--signal-danger-muted)]">
        <CardContent className="p-4">
          <div className="font-medium text-[var(--signal-danger)] mb-1">Rejected</div>
          <div className="text-sm text-[var(--ink-secondary)]">
            Tool &quot;{toolName}&quot; has been rejected.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="my-2 border-[var(--signal-warning)] bg-[var(--signal-warning-muted)]">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-[var(--signal-warning)]">
            Confirmation Required
          </span>
          <Badge variant="warning">{risk}</Badge>
        </div>
        <div className="text-sm text-[var(--ink-secondary)] mb-3">
          The agent wants to execute &quot;{toolName}&quot;. Please review and confirm or reject.
        </div>
        {error && (
          <div className="text-xs text-[var(--signal-danger)] mb-2">{error}</div>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={status === "loading"}
          >
            {status === "loading" ? "Processing…" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReject}
            disabled={status === "loading"}
          >
            Reject
          </Button>
          <span className="ml-auto text-xs text-[var(--ink-tertiary)] font-mono">
            {confirmationId.slice(0, 12)}…
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ErrorResult({ result }: { result: string | object | undefined }) {
  // Don't render if no result - this might be an intermediate state
  if (!result) {
    return <></>;
  }

  const data = parseResult(result);

  // If data has success: true, don't show error
  if (data?.success) {
    return <></>;
  }

  // If this is a confirmation_required response, show the confirmation card instead of an error
  if (isConfirmationRequired(data)) {
    return <ConfirmationRequiredCard data={data!} />;
  }

  const error = data?.error || "An error occurred";

  return (
    <Card className="my-2 border-[var(--signal-danger)] bg-[var(--signal-danger-muted)]">
      <CardContent className="p-4">
        <div className="font-medium text-[var(--signal-danger)] mb-1">Error</div>
        <div className="text-sm text-[var(--ink-secondary)]">{String(error)}</div>
      </CardContent>
    </Card>
  );
}
