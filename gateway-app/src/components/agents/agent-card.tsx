"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ExternalLinkIcon, 
  PowerIcon, 
  EditIcon, 
  TrashIcon,
  ChevronRightIcon,
  ShieldIcon,
  KeyIcon,
  RefreshIcon,
} from "@/components/ui/icons";

export interface Agent {
  id: string;
  name: string;
  description?: string | null;
  upstreamUrl: string;
  hasUpstreamSecret?: boolean;
  runtimeTokenPrefix?: string | null;
  isActive: boolean;
  requireConfirmation: boolean;
  tenantId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

interface AgentCardProps {
  agent: Agent;
  onSelect?: (agent: Agent) => void;
  onToggle?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onRegenerateToken?: (agent: Agent) => void;
  onConfigureProviders?: (agent: Agent) => void;
  compact?: boolean;
}

export function AgentCard({ agent, onSelect, onToggle, onDelete, onEdit, onRegenerateToken, onConfigureProviders, compact }: AgentCardProps) {
  if (compact) {
    return (
      <Card 
        className="group cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => onSelect?.(agent)}
      >
        <CardContent className="p-3 flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0
            ${agent.isActive 
              ? "bg-[var(--signal-success-muted)] text-[var(--signal-success)]" 
              : "bg-[var(--surface-sunken)] text-[var(--ink-muted)]"
            }
          `}>
            <span className="text-lg font-semibold">{agent.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--ink-primary)] truncate">{agent.name}</span>
              <Badge variant={agent.isActive ? "success" : "secondary"}>
                {agent.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-xs text-[var(--ink-tertiary)] truncate font-mono">{agent.id}</p>
          </div>
          <ChevronRightIcon size={16} className="text-[var(--ink-muted)] group-hover:text-[var(--ink-secondary)] transition-colors" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden gap-0 py-0">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`
              w-12 h-12 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0
              ${agent.isActive 
                ? "bg-[var(--signal-success-muted)] text-[var(--signal-success)]" 
                : "bg-[var(--surface-sunken)] text-[var(--ink-muted)]"
              }
            `}>
              <span className="text-xl font-semibold">{agent.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-[var(--ink-primary)] truncate">{agent.name}</h3>
              <p className="text-xs text-[var(--ink-tertiary)] font-mono truncate">{agent.id}</p>
            </div>
          </div>
          <Badge variant={agent.isActive ? "success" : "secondary"} className="flex-shrink-0">
            {agent.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>
      
      {/* Content — flex-1 so footer is always pinned to the bottom */}
      <CardContent className="flex-1 space-y-3 p-4">
        {agent.description && (
          <p className="text-sm text-[var(--ink-secondary)]">{agent.description}</p>
        )}
        
        <div className="flex items-center gap-2 text-xs">
          <ExternalLinkIcon size={14} className="text-[var(--ink-muted)] flex-shrink-0" />
          <span className="text-[var(--ink-tertiary)] font-mono truncate">{agent.upstreamUrl}</span>
        </div>

        {agent.runtimeTokenPrefix && (
          <div className="flex items-center gap-2 text-xs">
            <KeyIcon size={14} className="text-[var(--ink-muted)] flex-shrink-0" />
            <span className="text-[var(--ink-tertiary)] font-mono">{agent.runtimeTokenPrefix}...</span>
          </div>
        )}
        
        <div className="flex items-center gap-2 flex-wrap">
          {agent.hasUpstreamSecret && (
            <Badge variant="outline">
              <ShieldIcon size={12} />
              Auth Token
            </Badge>
          )}
          {agent.requireConfirmation && (
            <Badge variant="warning">
              <ShieldIcon size={12} />
              Confirmation Required
            </Badge>
          )}
          {agent.tenantId && (
            <Badge variant="outline">Tenant: {agent.tenantId}</Badge>
          )}
        </div>
      </CardContent>
      
      {/* Footer — always at the bottom */}
      <div className="px-4 py-3 bg-[var(--surface-sunken)] border-t border-[var(--border-subtle)] flex items-center justify-between gap-1">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => onConfigureProviders?.(agent)}
          title="Configure provider access"
        >
          <ShieldIcon size={14} />
          Providers
        </Button>
        <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onRegenerateToken?.(agent)}
          title="Regenerate runtime token"
        >
          <RefreshIcon size={14} />
          <KeyIcon size={14} />
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onToggle?.(agent)}
          title={agent.isActive ? "Disable agent" : "Enable agent"}
        >
          <PowerIcon size={14} />
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onEdit?.(agent)}
          title="Edit agent"
        >
          <EditIcon size={14} />
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onDelete?.(agent)}
          title="Delete agent"
          className="text-[var(--signal-danger)] hover:text-[var(--signal-danger)] hover:bg-[var(--signal-danger-muted)]"
        >
          <TrashIcon size={14} />
        </Button>
        </div>
      </div>
    </Card>
  );
}

export function AgentCardSkeleton() {
  return (
    <Card className="overflow-hidden gap-0 py-0">
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] animate-pulse" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-[var(--surface-sunken)] rounded animate-pulse mb-2" />
            <div className="h-3 w-48 bg-[var(--surface-sunken)] rounded animate-pulse" />
          </div>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="h-3 w-full bg-[var(--surface-sunken)] rounded animate-pulse mb-2" />
        <div className="h-3 w-2/3 bg-[var(--surface-sunken)] rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}
