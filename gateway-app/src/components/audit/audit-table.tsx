"use client";

import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { AuditIcon, ClockIcon } from "@/components/ui/icons";

export interface AuditLog {
  id: string;
  userId: string;
  tenantId?: string | null;
  agentId?: string | null;
  endUserId?: string | null;
  providerId?: string | null;
  toolName: string;
  arguments?: string | null;
  result?: string | null;
  confirmationId?: string | null;
  confirmedBy?: string | null;
  status: "pending" | "confirmed" | "rejected" | "completed" | "failed";
  duration?: number | null;
  createdAt: string;
  completedAt?: string | null;
}

interface AuditTableProps {
  logs: AuditLog[];
  loading?: boolean;
  onSelect?: (log: AuditLog) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function AuditTable({ logs, loading, onSelect }: AuditTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-[var(--surface-sunken)] rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AuditIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>No audit logs</EmptyTitle>
          <EmptyDescription>Tool call history will appear here once agents start making requests.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-[var(--radius-lg)] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Confirmation</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow
              key={log.id}
              className={onSelect ? "cursor-pointer hover:bg-[var(--surface-sunken)]/60 transition-colors" : ""}
              onClick={() => onSelect?.(log)}
            >
              <TableCell>
                <span className="font-mono text-sm">{log.toolName}</span>
              </TableCell>
              <TableCell>
                <Badge variant={
                  log.status === "completed" ? "success" :
                  log.status === "failed" ? "danger" :
                  log.status === "pending" ? "warning" :
                  log.status === "confirmed" ? "success" :
                  log.status === "rejected" ? "danger" : "secondary"
                }>
                  {log.status}
                </Badge>
              </TableCell>
              <TableCell>
                {log.agentId ? (
                  <span className="font-mono text-xs text-[var(--ink-tertiary)]">
                    {log.agentId.slice(0, 8)}...
                  </span>
                ) : (
                  <span className="text-[var(--ink-muted)]">-</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm text-[var(--ink-secondary)]">{log.userId}</span>
              </TableCell>
              <TableCell>
                {log.confirmationId ? (
                  <ConfirmationBadge log={log} />
                ) : (
                  <span className="text-[var(--ink-muted)]">-</span>
                )}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1 text-sm text-[var(--ink-tertiary)]">
                  <ClockIcon size={12} />
                  {formatDuration(log.duration)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-[var(--ink-tertiary)]">
                  {formatDate(log.createdAt)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConfirmationBadge({ log }: { log: AuditLog }) {
  const isResolved =
    log.status === "completed" || log.status === "confirmed";
  const isRejected = log.status === "rejected";

  if (isRejected) {
    return (
      <Badge variant="danger" className="text-xs">
        Rejected
      </Badge>
    );
  }

  if (log.confirmedBy || isResolved) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="success" className="text-xs">
          Confirmed
        </Badge>
        {log.confirmedBy && (
          <span className="font-mono text-xs text-[var(--ink-muted)]">
            by {log.confirmedBy.slice(0, 8)}...
          </span>
        )}
      </div>
    );
  }

  return (
    <Badge variant="warning" className="text-xs">
      Pending
    </Badge>
  );
}
