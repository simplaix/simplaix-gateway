"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyIcon, TrashIcon, ClockIcon, AlertIcon } from "@/components/ui/icons";
import { useState } from "react";
import type { GatewayApiKey, NewGatewayApiKey } from "@/lib/gateway-api";

interface ApiKeyCardProps {
  apiKey: GatewayApiKey | NewGatewayApiKey;
  onRevoke?: (apiKey: GatewayApiKey) => void;
  isNew?: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "credentials:resolve":
      return "Resolve";
    case "credentials:read":
      return "Read";
    case "credentials:write":
      return "Write";
    default:
      return scope;
  }
}

export function ApiKeyCard({ apiKey, onRevoke, isNew }: ApiKeyCardProps) {
  const [copied, setCopied] = useState(false);
  const expired = isExpired(apiKey.expiresAt);
  const fullKey = "key" in apiKey ? apiKey.key : null;

  const copyKey = async () => {
    if (fullKey) {
      await navigator.clipboard.writeText(fullKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card
      className={
        isNew
          ? "border-[var(--signal-success)] bg-[var(--signal-success-muted)]"
          : ""
      }
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-[var(--ink-primary)]">
                {apiKey.name}
              </span>
              {!apiKey.isActive && <Badge variant="secondary">Inactive</Badge>}
              {expired && <Badge variant="danger">Expired</Badge>}
              {isNew && <Badge variant="success">New</Badge>}
            </div>
            <p className="text-xs text-[var(--ink-tertiary)] font-mono">
              {apiKey.keyPrefix}...
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {apiKey.scopes.map((scope) => (
              <Badge key={scope} variant="secondary" className="text-xs">
                {scopeLabel(scope)}
              </Badge>
            ))}
          </div>
        </div>

        {fullKey && (
          <div className="mb-3 p-3 bg-[var(--surface-sunken)] rounded-[var(--radius-md)] border border-[var(--border-default)]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-[var(--signal-warning)]">
                <AlertIcon size={12} className="inline mr-1" />
                Save this key — it won&apos;t be shown again!
              </span>
              <Button variant="ghost" size="sm" onClick={copyKey}>
                <CopyIcon size={14} />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <code className="text-sm font-mono text-[var(--ink-primary)] break-all select-all">
              {fullKey}
            </code>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-[var(--ink-tertiary)]">
          <span>Created {formatDate(apiKey.createdAt)}</span>
          {apiKey.expiresAt && (
            <span className="flex items-center gap-1">
              <ClockIcon size={12} />
              {expired
                ? "Expired"
                : `Expires ${formatDate(apiKey.expiresAt)}`}
            </span>
          )}
          {apiKey.lastUsedAt && (
            <span>Last used {formatDate(apiKey.lastUsedAt)}</span>
          )}
        </div>

        {apiKey.isActive && !isNew && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRevoke?.(apiKey)}
              className="text-[var(--signal-danger)] hover:text-[var(--signal-danger)] hover:bg-[var(--signal-danger-muted)]"
            >
              <TrashIcon size={14} />
              Revoke
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ApiKeyCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="h-4 w-24 bg-[var(--surface-sunken)] rounded animate-pulse mb-2" />
            <div className="h-3 w-32 bg-[var(--surface-sunken)] rounded animate-pulse" />
          </div>
          <div className="flex gap-1.5">
            <div className="h-5 w-14 bg-[var(--surface-sunken)] rounded animate-pulse" />
          </div>
        </div>
        <div className="h-3 w-48 bg-[var(--surface-sunken)] rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}
