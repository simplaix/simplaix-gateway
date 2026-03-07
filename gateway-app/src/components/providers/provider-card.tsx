"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ExternalLinkIcon, 
  EditIcon, 
  TrashIcon,
  ShieldIcon,
  ServerIcon
} from "@/components/ui/icons";

export interface ToolProvider {
  id: string;
  name: string;
  pattern: string;
  endpoint: string;
  authType: "none" | "bearer" | "api_key";
  isActive: boolean;
  priority: number;
  description?: string | null;
  tenantId?: string | null;
  createdAt: string;
}

interface ProviderCardProps {
  provider: ToolProvider;
  onEdit?: (provider: ToolProvider) => void;
  onDelete?: (provider: ToolProvider) => void;
}

export function ProviderCard({ provider, onEdit, onDelete }: ProviderCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`
              w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0
              ${provider.isActive 
                ? "bg-[var(--accent-primary-muted)] text-[var(--accent-primary)]" 
                : "bg-[var(--surface-sunken)] text-[var(--ink-muted)]"
              }
            `}>
              <ServerIcon size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-[var(--ink-primary)] truncate">{provider.name}</h3>
              <p className="text-xs text-[var(--ink-tertiary)] font-mono truncate">{provider.id}</p>
            </div>
          </div>
          <Badge variant={provider.isActive ? "success" : "secondary"}>
            {provider.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>

        {provider.description && (
          <p className="text-sm text-[var(--ink-secondary)] mb-3">{provider.description}</p>
        )}

        <div className="flex items-center gap-2 text-xs mb-3">
          <ExternalLinkIcon size={14} className="text-[var(--ink-muted)]" />
          <span className="text-[var(--ink-tertiary)] font-mono truncate">{provider.endpoint}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-mono">{provider.pattern}</Badge>
          {provider.authType !== "none" && (
            <Badge variant="info">
              <ShieldIcon size={12} />
              {provider.authType === "bearer" ? "Bearer Auth" : "API Key"}
            </Badge>
          )}
          <Badge variant="outline">Priority: {provider.priority}</Badge>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <Button variant="ghost" size="sm" onClick={() => onEdit?.(provider)}>
            <EditIcon size={14} />
            Edit
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onDelete?.(provider)}
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

export function ProviderCardSkeleton() {
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
