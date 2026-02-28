"use client";

import { Card, CardContent } from "@/components/ui/card";
import { 
  ActivityIcon, 
  CheckIcon, 
  XIcon, 
  ClockIcon 
} from "@/components/ui/icons";

export interface AuditStats {
  totalCalls?: number;
  completedCalls?: number;
  failedCalls?: number;
  pendingCalls?: number;
  avgDuration?: number;
  successRate?: number;
}

interface AuditStatsProps {
  stats: AuditStats | null;
  loading?: boolean;
}

function StatCard({ 
  icon, 
  label, 
  value, 
  subValue,
  color = "default"
}: { 
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: "default" | "success" | "danger" | "warning";
}) {
  const colors = {
    default: "text-[var(--accent-primary)] bg-[var(--accent-primary-muted)]",
    success: "text-[var(--signal-success)] bg-[var(--signal-success-muted)]",
    danger: "text-[var(--signal-danger)] bg-[var(--signal-danger-muted)]",
    warning: "text-[var(--signal-warning)] bg-[var(--signal-warning-muted)]",
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center ${colors[color]}`}>
            {icon}
          </div>
          <div>
            <p className="text-xs text-[var(--ink-tertiary)] uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-semibold text-[var(--ink-primary)]">{value}</p>
            {subValue && (
              <p className="text-xs text-[var(--ink-muted)]">{subValue}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] animate-pulse" />
          <div>
            <div className="h-3 w-16 bg-[var(--surface-sunken)] rounded animate-pulse mb-2" />
            <div className="h-6 w-12 bg-[var(--surface-sunken)] rounded animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AuditStatsGrid({ stats, loading }: AuditStatsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<ActivityIcon size={18} />}
        label="Total Calls"
        value={stats.totalCalls ?? 0}
        color="default"
      />
      <StatCard
        icon={<CheckIcon size={18} />}
        label="Success Rate"
        value={stats.successRate ? `${Math.round(stats.successRate * 100)}%` : "N/A"}
        subValue={`${stats.completedCalls ?? 0} completed`}
        color="success"
      />
      <StatCard
        icon={<XIcon size={18} />}
        label="Failed"
        value={stats.failedCalls ?? 0}
        color="danger"
      />
      <StatCard
        icon={<ClockIcon size={18} />}
        label="Avg Duration"
        value={stats.avgDuration ? `${Math.round(stats.avgDuration)}ms` : "N/A"}
        color="warning"
      />
    </div>
  );
}
