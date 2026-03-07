"use client";

import { TokenCard, TokenCardSkeleton, Token, NewToken } from "./token-card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { TokenIcon } from "@/components/ui/icons";

interface TokenListProps {
  tokens: (Token | NewToken)[];
  loading?: boolean;
  onRevoke?: (token: Token) => void;
  onRotate?: (token: Token) => void;
  newTokenIds?: Set<string>;
}

export function TokenList({ tokens, loading, onRevoke, onRotate, newTokenIds }: TokenListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <TokenCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!tokens || tokens.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TokenIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>No tokens</EmptyTitle>
          <EmptyDescription>Create an access token to authenticate API requests for this agent.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {tokens.map((token) => (
        <TokenCard
          key={token.id}
          token={token}
          onRevoke={onRevoke}
          onRotate={onRotate}
          isNew={newTokenIds?.has(token.id) || "token" in token}
        />
      ))}
    </div>
  );
}
