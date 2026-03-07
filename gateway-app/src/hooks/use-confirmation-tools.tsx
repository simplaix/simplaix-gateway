"use client";

import { useRenderToolCall } from "@copilotkit/react-core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmationIcon } from "@/components/ui/icons";
import { ConfirmationList } from "@/components/confirmations/confirmation-list";
import { Confirmation } from "@/components/confirmations/confirmation-card";
import { LoadingCard, SuccessCard, ErrorResult } from "@/components/shared";
import { parseResult } from "@/lib/utils";

export function useConfirmationTools() {
  useRenderToolCall(
    {
      name: "list_pending_confirmations",
      parameters: [],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <ConfirmationList confirmations={[]} loading />;
        }
        const data = parseResult(result);
        if (data?.confirmations !== undefined && Array.isArray(data.confirmations)) {
          const pending = data.confirmations.filter((a: Confirmation) => a.status === "pending");
          return (
            <Card className="my-2">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ConfirmationIcon size={16} />
                  <span>Pending Confirmations</span>
                  {pending.length > 0 && (
                    <Badge variant="warning">{pending.length}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ConfirmationList confirmations={pending} />
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
      name: "confirm_request",
      parameters: [{ name: "confirmation_id", description: "Confirmation ID", required: true }],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Confirming request..." />;
        }
        const data = parseResult(result);
        if (data?.success || data?.message) {
          return <SuccessCard title="Request Confirmed" message="The tool call has been executed." />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );

  useRenderToolCall(
    {
      name: "reject_request",
      parameters: [{ name: "confirmation_id", description: "Confirmation ID", required: true }],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Rejecting request..." />;
        }
        const data = parseResult(result);
        if (data?.success || data?.message) {
          return <SuccessCard title="Request Rejected" message="The tool call has been blocked." variant="warning" />;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );
}
