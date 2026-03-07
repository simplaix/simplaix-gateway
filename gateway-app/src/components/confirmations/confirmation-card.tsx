"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckIcon, 
  XIcon,
  ClockIcon,
  AlertIcon,
  ShieldIcon
} from "@/components/ui/icons";

export interface Confirmation {
  id: string;
  requestId: string;
  userId: string;
  tenantId?: string | null;
  toolName: string;
  arguments?: Record<string, unknown> | string | null;
  risk: "low" | "medium" | "high" | "critical";
  status: "pending" | "confirmed" | "rejected" | "expired";
  confirmedBy?: string | null;
  reason?: string | null;
  // Extended context fields
  providerId?: string | null;
  agentId?: string | null;
  endUserId?: string | null;
  ruleId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

interface ConfirmationCardProps {
  confirmation: Confirmation;
  onConfirm?: (confirmation: Confirmation, reason?: string) => void;
  onReject?: (confirmation: Confirmation, reason?: string) => void;
  loading?: boolean;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

const riskConfig = {
  low: { variant: "success" as const, label: "Low Risk" },
  medium: { variant: "warning" as const, label: "Medium Risk" },
  high: { variant: "danger" as const, label: "High Risk" },
  critical: { variant: "danger" as const, label: "Critical" },
};

export function ConfirmationCard({ confirmation, onConfirm, onReject, loading }: ConfirmationCardProps) {
  const { variant, label } = riskConfig[confirmation.risk];
  const isPending = confirmation.status === "pending";
  
  let args: Record<string, unknown> | null = null;
  if (confirmation.arguments) {
    if (typeof confirmation.arguments === "string") {
      try {
        args = JSON.parse(confirmation.arguments);
      } catch {
        args = null;
      }
    } else {
      args = confirmation.arguments;
    }
  }

  return (
    <Card className={isPending ? "border-[var(--signal-warning)]" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-medium text-[var(--ink-primary)]">{confirmation.toolName}</span>
              <Badge variant={variant}>
                <ShieldIcon size={12} />
                {label}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--ink-tertiary)]">
              <ClockIcon size={12} />
              <span>{formatTimeAgo(confirmation.createdAt)}</span>
              <span className="text-[var(--ink-muted)]">by</span>
              <span className="font-mono">{confirmation.userId}</span>
            </div>
            {(confirmation.providerId || confirmation.agentId || confirmation.endUserId) && (
              <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mt-1 flex-wrap">
                {confirmation.providerId && (
                  <span className="font-mono">provider: {confirmation.providerId.slice(0, 10)}...</span>
                )}
                {confirmation.agentId && (
                  <span className="font-mono">agent: {confirmation.agentId.slice(0, 10)}...</span>
                )}
                {confirmation.endUserId && confirmation.endUserId !== confirmation.userId && (
                  <span className="font-mono">end-user: {confirmation.endUserId.slice(0, 10)}...</span>
                )}
              </div>
            )}
          </div>
          
          {isPending && (
            <div className="flex items-center">
              <span className="status-dot status-dot-pending mr-2" />
              <span className="text-sm text-[var(--signal-warning)]">Pending</span>
            </div>
          )}
        </div>

        {args && Object.keys(args).length > 0 && (
          <div className="mb-3 p-3 bg-[var(--surface-sunken)] rounded-[var(--radius-md)] overflow-auto max-h-32">
            <pre className="text-xs font-mono text-[var(--ink-secondary)]">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
        )}

        {confirmation.reason && (
          <p className="text-sm text-[var(--ink-secondary)] mb-3">
            <span className="font-medium">Reason:</span> {confirmation.reason}
          </p>
        )}

        {isPending && (
          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => onConfirm?.(confirmation)}
              className="flex-1"
              disabled={loading}
            >
              <CheckIcon size={14} />
              {loading ? "Processing..." : "Confirm"}
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => onReject?.(confirmation)}
              className="flex-1"
              disabled={loading}
            >
              <XIcon size={14} />
              {loading ? "Processing..." : "Reject"}
            </Button>
          </div>
        )}

        {!isPending && confirmation.resolvedAt && (
          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-subtle)] text-sm">
            {confirmation.status === "confirmed" ? (
              <>
                <CheckIcon size={14} className="text-[var(--signal-success)]" />
                <span className="text-[var(--signal-success)]">Confirmed</span>
              </>
            ) : confirmation.status === "rejected" ? (
              <>
                <XIcon size={14} className="text-[var(--signal-danger)]" />
                <span className="text-[var(--signal-danger)]">Rejected</span>
              </>
            ) : (
              <>
                <AlertIcon size={14} className="text-[var(--ink-muted)]" />
                <span className="text-[var(--ink-muted)]">Expired</span>
              </>
            )}
            {confirmation.confirmedBy && (
              <span className="text-[var(--ink-tertiary)]">by {confirmation.confirmedBy}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ConfirmationCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="h-4 w-32 bg-[var(--surface-sunken)] rounded animate-pulse mb-2" />
            <div className="h-3 w-48 bg-[var(--surface-sunken)] rounded animate-pulse" />
          </div>
        </div>
        <div className="h-20 bg-[var(--surface-sunken)] rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}
