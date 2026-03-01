"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { PlusIcon, RefreshIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ApiKeyList } from "@/components/api-keys";
import { ApiKeyFormDialog } from "@/components/forms";
import type { ApiKeyFormData } from "@/components/forms/api-key-form";
import * as api from "@/lib/gateway-api";
import type { GatewayApiKey, NewGatewayApiKey } from "@/lib/gateway-api";

// Fetcher function for SWR
const fetchApiKeys = async () => {
  const result = await api.listApiKeys();
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch API keys");
  }
  return result.data.keys;
};

export function ApiKeysTab() {
  const [formOpen, setFormOpen] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<GatewayApiKey | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [newKeyIds, setNewKeyIds] = useState<Set<string>>(new Set());
  // Store newly created keys (with full key value) separately
  const [newKeys, setNewKeys] = useState<NewGatewayApiKey[]>([]);

  const {
    data: apiKeys = [],
    isLoading,
    mutate,
  } = useSWR("api-keys", fetchApiKeys);

  // Merge new keys (with full key value) into the list
  const mergedKeys: (GatewayApiKey | NewGatewayApiKey)[] = apiKeys.map(
    (k) => {
      const newKey = newKeys.find((nk) => nk.id === k.id);
      return newKey || k;
    }
  );

  // Create API key
  const handleCreateKey = async (data: ApiKeyFormData) => {
    setActionLoading(true);

    const expiresAt = data.expiresInDays
      ? new Date(
          Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000
        ).toISOString()
      : undefined;

    const result = await api.createApiKey({
      name: data.name,
      scopes: data.scopes,
      expiresAt,
    });

    setActionLoading(false);

    if (result.success && result.data) {
      setFormOpen(false);

      // The API returns { key, keyRecord: {...} }
      const response = result.data as unknown as {
        key: string;
        keyRecord: GatewayApiKey;
      };

      const newKey: NewGatewayApiKey = {
        ...response.keyRecord,
        key: response.key,
      };

      setNewKeyIds((prev) => new Set(prev).add(newKey.id));
      setNewKeys((prev) => [...prev, newKey]);

      await mutate();
    } else {
      console.error("Failed to create API key:", result.error);
    }
  };

  // Revoke API key
  const handleRevoke = async () => {
    if (!keyToRevoke) return;

    setActionLoading(true);
    const result = await api.revokeApiKey(keyToRevoke.id);
    setActionLoading(false);

    if (result.success) {
      setRevokeConfirmOpen(false);
      setKeyToRevoke(null);
      // Remove from newKeys if present
      setNewKeys((prev) => prev.filter((k) => k.id !== keyToRevoke.id));
      await mutate();
    } else {
      console.error("Failed to revoke API key:", result.error);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-[var(--ink-primary)]">
              API Keys
            </h2>
            <p className="text-sm text-[var(--ink-tertiary)] mt-0.5">
              Manage server-to-server authentication keys for agents and
              downstream applications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => mutate()}
              disabled={isLoading}
            >
              <RefreshIcon
                size={16}
                className={isLoading ? "animate-spin" : ""}
              />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setFormOpen(true)}
            >
              <PlusIcon size={16} />
              Create API Key
            </Button>
          </div>
        </div>

        <ApiKeyList
          apiKeys={mergedKeys}
          loading={isLoading}
          onRevoke={(apiKey: GatewayApiKey) => {
            setKeyToRevoke(apiKey);
            setRevokeConfirmOpen(true);
          }}
          newKeyIds={newKeyIds}
        />
      </div>

      {/* Create API Key Dialog */}
      <ApiKeyFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreateKey}
        loading={actionLoading}
      />

      {/* Revoke Confirmation */}
      <ConfirmDialog
        open={revokeConfirmOpen}
        onClose={() => {
          setRevokeConfirmOpen(false);
          setKeyToRevoke(null);
        }}
        onConfirm={handleRevoke}
        title="Revoke API Key"
        description={`Are you sure you want to revoke "${keyToRevoke?.name}" (${keyToRevoke?.keyPrefix}...)? Any services using this key will lose access. This action cannot be undone.`}
        confirmLabel="Revoke Key"
        confirmVariant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
