"use client";

import { ApiKeyCard, ApiKeyCardSkeleton } from "./api-key-card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { KeyIcon } from "@/components/ui/icons";
import type { GatewayApiKey, NewGatewayApiKey } from "@/lib/gateway-api";

interface ApiKeyListProps {
  apiKeys: (GatewayApiKey | NewGatewayApiKey)[];
  loading?: boolean;
  onRevoke?: (apiKey: GatewayApiKey) => void;
  newKeyIds?: Set<string>;
}

export function ApiKeyList({
  apiKeys,
  loading,
  onRevoke,
  newKeyIds,
}: ApiKeyListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <ApiKeyCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!apiKeys || apiKeys.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>No API keys</EmptyTitle>
          <EmptyDescription>
            Create an API key to enable server-to-server authentication for
            agents and downstream applications.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {apiKeys.map((apiKey) => (
        <ApiKeyCard
          key={apiKey.id}
          apiKey={apiKey}
          onRevoke={onRevoke}
          isNew={newKeyIds?.has(apiKey.id) || "key" in apiKey}
        />
      ))}
    </div>
  );
}
