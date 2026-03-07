"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ClockIcon } from "@/components/ui/icons";
import type { AuditLog } from "./audit-table";

interface AuditDetailSheetProps {
  log: AuditLog | null;
  open: boolean;
  onClose: () => void;
}

function statusVariant(status: AuditLog["status"]) {
  switch (status) {
    case "completed":
    case "confirmed":
      return "success";
    case "failed":
    case "rejected":
      return "danger";
    case "pending":
      return "warning";
    default:
      return "secondary";
  }
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function tryParseJSON(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function formatJSON(value: unknown): string {
  const parsed = tryParseJSON(value);
  if (parsed === null || parsed === undefined) return "-";
  if (typeof parsed === "string") return parsed;
  return JSON.stringify(parsed, null, 2);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--ink-tertiary)] uppercase tracking-wider mb-1">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function MonoValue({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[var(--ink-muted)]">-</span>;
  return <span className="font-mono text-sm text-[var(--ink-secondary)] break-all">{value}</span>;
}

export function AuditDetailSheet({ log, open, onClose }: AuditDetailSheetProps) {
  if (!log) return null;

  const args = formatJSON(log.arguments);
  const result = formatJSON(log.result);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono">{log.toolName}</span>
            <Badge variant={statusVariant(log.status)}>{log.status}</Badge>
          </SheetTitle>
          <SheetDescription>{formatTimestamp(log.createdAt)}</SheetDescription>
        </SheetHeader>

        <dl className="space-y-5 p-4">
          {/* Identifiers */}
          <Field label="Audit ID">
            <MonoValue value={log.id} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Agent ID">
              <MonoValue value={log.agentId} />
            </Field>
            <Field label="Provider ID">
              <MonoValue value={log.providerId} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="User ID">
              <MonoValue value={log.userId} />
            </Field>
            <Field label="End-User ID">
              <MonoValue value={log.endUserId} />
            </Field>
          </div>

          {log.tenantId && (
            <Field label="Tenant ID">
              <MonoValue value={log.tenantId} />
            </Field>
          )}

          {/* Timing */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Duration">
              <span className="flex items-center gap-1 text-sm text-[var(--ink-secondary)]">
                <ClockIcon size={13} />
                {formatDuration(log.duration)}
              </span>
            </Field>
            {log.completedAt && (
              <Field label="Completed At">
                <span className="text-sm text-[var(--ink-secondary)]">
                  {formatTimestamp(log.completedAt)}
                </span>
              </Field>
            )}
          </div>

          {/* Confirmation */}
          {log.confirmationId && (
            <div className="border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-3 space-y-3 bg-[var(--surface-sunken)]">
              <p className="text-xs font-medium text-[var(--ink-tertiary)] uppercase tracking-wider">
                Confirmation
              </p>
              <Field label="Confirmation ID">
                <MonoValue value={log.confirmationId} />
              </Field>
              {log.confirmedBy && (
                <Field label="Confirmed By">
                  <MonoValue value={log.confirmedBy} />
                </Field>
              )}
            </div>
          )}

          {/* Arguments */}
          {args !== "-" && (
            <Field label="Arguments">
              <pre className="mt-1 p-3 bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-xs font-mono text-[var(--ink-secondary)] overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {args}
              </pre>
            </Field>
          )}

          {/* Result */}
          {result !== "-" && (
            <Field label="Result">
              <pre className="mt-1 p-3 bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-xs font-mono text-[var(--ink-secondary)] overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {result}
              </pre>
            </Field>
          )}
        </dl>
      </SheetContent>
    </Sheet>
  );
}
