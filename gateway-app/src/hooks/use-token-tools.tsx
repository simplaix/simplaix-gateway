"use client";

import { useRenderToolCall } from "@copilotkit/react-core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TokenIcon } from "@/components/ui/icons";
import { TokenList } from "@/components/tokens/token-list";
import { LoadingCard, SuccessCard, ErrorResult } from "@/components/shared";
import { parseResult } from "@/lib/utils";

export function useTokenTools() {
  useRenderToolCall(
    {
      name: "list_tokens",
      parameters: [{ name: "agent_id", description: "Agent ID", required: true }],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <TokenList tokens={[]} loading />;
        }
        const data = parseResult(result);
        if (data?.tokens && Array.isArray(data.tokens)) {
          return (
            <Card className="my-2">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TokenIcon size={16} />
                  <span>Tokens ({data.tokens.length})</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <TokenList tokens={data.tokens} />
              </CardContent>
            </Card>
          );
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );

  useRenderToolCall(
    {
      name: "create_token",
      parameters: [
        { name: "agent_id", description: "Agent ID", required: true },
        { name: "name", description: "Token name", required: true },
      ],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Generating token..." />;
        }
        const data = parseResult(result);
        if (data?.success && data?.token) {
          const token = data.token as { token?: string; tokenValue?: string };
          const tokenValue = token.token || token.tokenValue;
          return (
            <Card className="my-2 border-[var(--signal-success)]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TokenIcon size={18} className="text-[var(--signal-success)]" />
                  <span className="font-medium text-[var(--signal-success)]">Token Created</span>
                </div>
                <p className="text-sm text-[var(--signal-warning)] mb-2">
                  Save this token now - it won&apos;t be shown again!
                </p>
                {tokenValue && (
                  <code className="block p-3 bg-[var(--surface-sunken)] rounded text-sm font-mono break-all select-all">
                    {tokenValue}
                  </code>
                )}
              </CardContent>
            </Card>
          );
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );

  useRenderToolCall(
    {
      name: "revoke_token",
      parameters: [{ name: "token_id", description: "Token ID", required: true }],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Revoking token..." />;
        }
        const data = parseResult(result);
        if (data?.success) {
          return <SuccessCard title="Token Revoked" message="The token is no longer valid for API calls." variant="warning" />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );

  useRenderToolCall(
    {
      name: "rotate_token",
      parameters: [{ name: "token_id", description: "Token ID", required: true }],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Rotating token..." />;
        }
        const data = parseResult(result);
        if (data?.success && data?.token) {
          const token = data.token as { token?: string; tokenValue?: string };
          const tokenValue = token.token || token.tokenValue;
          return (
            <Card className="my-2 border-[var(--signal-success)]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TokenIcon size={18} className="text-[var(--signal-success)]" />
                  <span className="font-medium text-[var(--signal-success)]">Token Rotated</span>
                </div>
                <p className="text-sm text-[var(--signal-warning)] mb-2">
                  Old token revoked. Save the new token now!
                </p>
                {tokenValue && (
                  <code className="block p-3 bg-[var(--surface-sunken)] rounded text-sm font-mono break-all select-all">
                    {tokenValue}
                  </code>
                )}
              </CardContent>
            </Card>
          );
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );
}
