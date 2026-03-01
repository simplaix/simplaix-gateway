"use client";

import { useRenderToolCall } from "@copilotkit/react-core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProviderIcon } from "@/components/ui/icons";
import { ProviderList } from "@/components/providers/provider-list";
import { LoadingCard, SuccessCard, ErrorResult } from "@/components/shared";
import { parseResult } from "@/lib/utils";

export function useProviderTools() {
  useRenderToolCall(
    {
      name: "list_tool_providers",
      parameters: [],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <ProviderList providers={[]} loading />;
        }
        const data = parseResult(result);
        if (data?.providers && Array.isArray(data.providers)) {
          return (
            <Card className="my-2">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ProviderIcon size={16} />
                  <span>Tool Providers ({data.providers.length})</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ProviderList providers={data.providers} />
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
      name: "create_tool_provider",
      parameters: [
        { name: "name", description: "Provider name", required: true },
        { name: "pattern", description: "Pattern", required: true },
        { name: "endpoint", description: "Endpoint URL", required: true },
      ],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Creating tool provider..." />;
        }
        const data = parseResult(result);
        if (data?.success) {
          const message = data.message as string;
          return <SuccessCard title="Provider Created" message={message} />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );
}
