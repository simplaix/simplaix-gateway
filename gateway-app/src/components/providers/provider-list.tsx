"use client";

import { ProviderCard, ProviderCardSkeleton, ToolProvider } from "./provider-card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ProviderIcon } from "@/components/ui/icons";

interface ProviderListProps {
  providers: ToolProvider[];
  loading?: boolean;
  onEdit?: (provider: ToolProvider) => void;
  onDelete?: (provider: ToolProvider) => void;
}

export function ProviderList({ providers, loading, onEdit, onDelete }: ProviderListProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <ProviderCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ProviderIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>No tool providers configured</EmptyTitle>
          <EmptyDescription>Add a tool provider to route tool calls to your MCP servers.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Sort by priority (higher first)
  const sorted = [...providers].sort((a, b) => b.priority - a.priority);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {sorted.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
