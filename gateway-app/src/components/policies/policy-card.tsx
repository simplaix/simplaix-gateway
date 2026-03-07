"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EditIcon,
  TrashIcon,
  ShieldIcon,
} from "@/components/ui/icons";

export interface PolicyRule {
  id: string;
  tenantId?: string | null;
  subjectType: "user" | "agent";
  subjectId: string;
  providerId: string;
  action: "allow" | "deny" | "require_confirmation";
  toolPattern: string;
  confirmationMode?: "always" | "never" | null;
  riskLevel?: "low" | "medium" | "high" | "critical" | null;
  description?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

interface PolicyCardProps {
  policy: PolicyRule;
  onEdit?: (policy: PolicyRule) => void;
  onDelete?: (policy: PolicyRule) => void;
}

const actionColors: Record<string, string> = {
  allow: "success",
  deny: "danger",
  require_confirmation: "warning",
};

const actionLabels: Record<string, string> = {
  allow: "Allow",
  deny: "Deny",
  require_confirmation: "Require Confirmation",
};

const riskColors: Record<string, string> = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

export function PolicyCard({ policy, onEdit, onDelete }: PolicyCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`
              w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0
              ${
                policy.action === "require_confirmation"
                  ? "bg-[var(--signal-warning-muted)] text-[var(--signal-warning)]"
                  : policy.action === "deny"
                  ? "bg-[var(--signal-danger-muted)] text-[var(--signal-danger)]"
                  : "bg-[var(--accent-primary-muted)] text-[var(--accent-primary)]"
              }
            `}
            >
              <ShieldIcon size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-[var(--ink-primary)] truncate">
                {policy.toolPattern === "*"
                  ? "All Tools"
                  : policy.toolPattern}
              </h3>
              <p className="text-xs text-[var(--ink-tertiary)] font-mono truncate">
                {policy.subjectType}: {policy.subjectId}
              </p>
            </div>
          </div>
          <Badge variant={actionColors[policy.action] as any}>
            {actionLabels[policy.action] || policy.action}
          </Badge>
        </div>

        {policy.description && (
          <p className="text-sm text-[var(--ink-secondary)] mb-3">
            {policy.description}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-mono">
            Provider: {policy.providerId === "*" ? "All" : policy.providerId.slice(0, 8) + "..."}
          </Badge>
          {policy.riskLevel && (
            <Badge variant={riskColors[policy.riskLevel] as any}>
              Risk: {policy.riskLevel}
            </Badge>
          )}
          {policy.confirmationMode && (
            <Badge variant="outline">
              Confirmation: {policy.confirmationMode}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <Button variant="ghost" size="sm" onClick={() => onEdit?.(policy)}>
            <EditIcon size={14} />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete?.(policy)}
            className="text-[var(--signal-danger)] hover:text-[var(--signal-danger)] hover:bg-[var(--signal-danger-muted)]"
          >
            <TrashIcon size={14} />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PolicyCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] animate-pulse" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-[var(--surface-sunken)] rounded animate-pulse mb-2" />
            <div className="h-3 w-20 bg-[var(--surface-sunken)] rounded animate-pulse" />
          </div>
        </div>
        <div className="h-3 w-48 bg-[var(--surface-sunken)] rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}
