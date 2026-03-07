"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CopyIcon, 
  TrashIcon, 
  RotateIcon,
  ClockIcon,
  AlertIcon
} from "@/components/ui/icons";
import { useState } from "react";

export interface Token {
  id: string;
  agentId: string;
  tokenPrefix: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
}

export interface NewToken extends Token {
  token: string; // Full token value, only shown once
}

interface TokenCardProps {
  token: Token | NewToken;
  onRevoke?: (token: Token) => void;
  onRotate?: (token: Token) => void;
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

export function TokenCard({ token, onRevoke, onRotate, isNew }: TokenCardProps) {
  const [copied, setCopied] = useState(false);
  const expired = isExpired(token.expiresAt);
  const fullToken = "token" in token ? token.token : null;

  const copyToken = async () => {
    if (fullToken) {
      await navigator.clipboard.writeText(fullToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className={isNew ? "border-[var(--signal-success)] bg-[var(--signal-success-muted)]" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-[var(--ink-primary)]">{token.name}</span>
              {!token.isActive && <Badge variant="secondary">Inactive</Badge>}
              {expired && <Badge variant="danger">Expired</Badge>}
              {isNew && <Badge variant="success">New</Badge>}
            </div>
            <p className="text-xs text-[var(--ink-tertiary)] font-mono">{token.tokenPrefix}...</p>
          </div>
        </div>

        {fullToken && (
          <div className="mb-3 p-3 bg-[var(--surface-sunken)] rounded-[var(--radius-md)] border border-[var(--border-default)]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-[var(--signal-warning)]">
                <AlertIcon size={12} className="inline mr-1" />
                Save this token - it won&apos;t be shown again!
              </span>
              <Button variant="ghost" size="sm" onClick={copyToken}>
                <CopyIcon size={14} />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <code className="text-sm font-mono text-[var(--ink-primary)] break-all select-all">
              {fullToken}
            </code>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-[var(--ink-tertiary)]">
          <span>Created {formatDate(token.createdAt)}</span>
          {token.expiresAt && (
            <span className="flex items-center gap-1">
              <ClockIcon size={12} />
              {expired ? "Expired" : `Expires ${formatDate(token.expiresAt)}`}
            </span>
          )}
          {token.lastUsedAt && (
            <span>Last used {formatDate(token.lastUsedAt)}</span>
          )}
        </div>

        {token.isActive && !isNew && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" size="sm" onClick={() => onRotate?.(token)}>
              <RotateIcon size={14} />
              Rotate
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onRevoke?.(token)}
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

export function TokenCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="h-4 w-24 bg-[var(--surface-sunken)] rounded animate-pulse mb-2" />
            <div className="h-3 w-32 bg-[var(--surface-sunken)] rounded animate-pulse" />
          </div>
        </div>
        <div className="h-3 w-48 bg-[var(--surface-sunken)] rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}
