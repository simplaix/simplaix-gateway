"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { PlusIcon, RefreshIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ProviderList } from "@/components/providers";
import { ToolProvider } from "@/components/providers/provider-card";
import { ProviderFormDialog } from "@/components/forms";
import { DashboardState, initialDashboardState } from "@/types";
import * as api from "@/lib/gateway-api";

interface ProvidersTabProps {
  state: DashboardState;
  setState: (newState: DashboardState | ((prevState: DashboardState | undefined) => DashboardState)) => void;
}

// Fetcher function for SWR
const fetchProviders = async () => {
  const result = await api.listProviders();
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch providers");
  }
  return result.data.providers;
};

export function ProvidersTab({ state, setState }: ProvidersTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ToolProvider | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<ToolProvider | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Use SWR for fetching providers
  const { data: providers, isLoading, mutate } = useSWR("providers", fetchProviders, {
    fallbackData: state.toolProviders,
    onSuccess: (data) => {
      setState(prev => ({
        ...initialDashboardState,
        ...prev,
        toolProviders: data,
        loading: { ...initialDashboardState.loading, ...prev?.loading, providers: false },
      }));
    },
  });

  // Create or update provider
  const handleSubmit = async (data: {
    name: string;
    pattern: string;
    endpoint: string;
    authType: "none" | "bearer" | "api_key";
    authSecret: string;
    description: string;
    priority: number;
  }) => {
    setActionLoading(true);
    
    let result;
    if (editingProvider) {
      result = await api.updateProvider(editingProvider.id, {
        name: data.name,
        pattern: data.pattern,
        endpoint: data.endpoint,
        authType: data.authType,
        authSecret: data.authSecret || undefined,
        description: data.description || undefined,
        priority: data.priority,
      });
    } else {
      result = await api.createProvider({
        name: data.name,
        pattern: data.pattern,
        endpoint: data.endpoint,
        authType: data.authType,
        authSecret: data.authSecret || undefined,
        description: data.description || undefined,
        priority: data.priority,
      });
    }
    
    setActionLoading(false);
    
    if (result.success) {
      setFormOpen(false);
      setEditingProvider(null);
      await mutate();
    } else {
      console.error("Failed to save provider:", result.error);
    }
  };

  // Delete provider
  const handleDelete = async () => {
    if (!providerToDelete) return;
    
    setActionLoading(true);
    const result = await api.deleteProvider(providerToDelete.id);
    setActionLoading(false);
    
    if (result.success) {
      setDeleteConfirmOpen(false);
      setProviderToDelete(null);
      await mutate();
    } else {
      console.error("Failed to delete provider:", result.error);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink-primary)]">Tool Providers</h2>
          <p className="text-sm text-[var(--ink-tertiary)]">
            Route tool calls to MCP servers by pattern
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => mutate()} disabled={isLoading}>
            <RefreshIcon size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button variant="default" size="sm" onClick={() => setFormOpen(true)}>
            <PlusIcon size={16} />
            Create Provider
          </Button>
        </div>
      </div>
      
      <ProviderList
        providers={providers ?? []}
        loading={isLoading}
        onEdit={(provider: ToolProvider) => {
          setEditingProvider(provider);
          setFormOpen(true);
        }}
        onDelete={(provider: ToolProvider) => {
          setProviderToDelete(provider);
          setDeleteConfirmOpen(true);
        }}
      />

      {/* Create/Edit Dialog */}
      <ProviderFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingProvider(null);
        }}
        onSubmit={handleSubmit}
        provider={editingProvider}
        loading={actionLoading}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setProviderToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Delete Tool Provider"
        description={`Are you sure you want to delete "${providerToDelete?.name}"? Tools matching this provider's pattern will fall back to other providers or fail.`}
        confirmLabel="Delete Provider"
        confirmVariant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
