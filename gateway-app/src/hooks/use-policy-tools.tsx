"use client";

import { useRenderToolCall } from "@copilotkit/react-core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ShieldIcon } from "@/components/ui/icons";
import { PolicyList } from "@/components/policies/policy-list";
import { LoadingCard, SuccessCard, ErrorResult } from "@/components/shared";
import { parseResult } from "@/lib/utils";

export function usePolicyTools() {
  useRenderToolCall(
    {
      name: "list_access_policies",
      parameters: [],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <PolicyList policies={[]} loading />;
        }
        const data = parseResult(result);
        if (data?.rules && Array.isArray(data.rules)) {
          return (
            <Card className="my-2">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldIcon size={16} />
                  <span>Access Policies ({data.rules.length})</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <PolicyList policies={data.rules} />
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
      name: "create_access_policy",
      parameters: [
        { name: "subjectType", description: "Subject type (user/agent)", required: true },
        { name: "subjectId", description: "Subject ID (user ID or agent ID)", required: true },
        { name: "providerId", description: "Provider ID or *", required: true },
        { name: "action", description: "allow/deny/require_confirmation", required: true },
        { name: "toolPattern", description: "Tool pattern (glob)" },
      ],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Creating access policy..." />;
        }
        const data = parseResult(result);
        if (data?.success) {
          const message = data.message as string;
          return <SuccessCard title="Policy Created" message={message} />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );

  useRenderToolCall(
    {
      name: "evaluate_tool_policy",
      parameters: [
        { name: "userId", description: "User ID to test", required: true },
        { name: "providerId", description: "Provider ID", required: true },
        { name: "toolName", description: "Tool name to evaluate", required: true },
      ],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Evaluating policy..." />;
        }
        const data = parseResult(result);
        if (data?.action) {
          const actionColors: Record<string, string> = {
            allow: "text-[var(--signal-success)]",
            deny: "text-[var(--signal-danger)]",
            require_confirmation: "text-[var(--signal-warning)]",
          };
          return (
            <Card className="my-2">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldIcon size={16} />
                  <span className="font-medium text-sm">Policy Evaluation Result</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div>
                    Action:{" "}
                    <span className={`font-bold ${actionColors[data.action as string] || ""}`}>
                      {(data.action as string).toUpperCase()}
                    </span>
                  </div>
                  <div>Risk: <span className="font-mono">{data.risk as string}</span></div>
                  {data.matchedRule && (
                    <div className="text-xs text-[var(--ink-tertiary)]">
                      Matched rule: {(data.matchedRule as any).toolPattern} ({(data.matchedRule as any).subjectType}: {(data.matchedRule as any).subjectId})
                    </div>
                  )}
                </div>
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
      name: "delete_access_policy",
      parameters: [
        { name: "id", description: "Policy rule ID to delete", required: true },
      ],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Deleting access policy..." />;
        }
        const data = parseResult(result);
        if (data?.success) {
          return <SuccessCard title="Policy Deleted" message="The access policy has been removed." />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );
}
