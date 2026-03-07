"use client";

import { useRenderToolCall } from "@copilotkit/react-core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AuditIcon, ActivityIcon } from "@/components/ui/icons";
import { AuditTable } from "@/components/audit/audit-table";
import { AuditStatsGrid } from "@/components/audit/audit-stats";
import { LoadingCard, SuccessCard, ErrorResult } from "@/components/shared";
import { parseResult } from "@/lib/utils";

export function useAuditTools() {
  useRenderToolCall(
    {
      name: "get_audit_logs",
      parameters: [],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <AuditTable logs={[]} loading />;
        }
        const data = parseResult(result);
        if (data?.logs && Array.isArray(data.logs)) {
          return (
            <Card className="my-2">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AuditIcon size={16} />
                  <span>Audit Logs ({data.logs.length})</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <AuditTable logs={data.logs} />
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
      name: "get_audit_stats",
      parameters: [],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <AuditStatsGrid stats={null} loading />;
        }
        const data = parseResult(result);
        if (data?.stats) {
          return (
            <Card className="my-2">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ActivityIcon size={16} />
                  <span>Audit Statistics</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <AuditStatsGrid stats={data.stats} />
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
      name: "check_gateway_health",
      parameters: [],
      render: ({ status, result }) => {
        if (status === "executing") {
          return <LoadingCard title="Checking gateway health..." />;
        }
        const data = parseResult(result);
        // Check for success - either explicit success flag or presence of health data
        if (data?.success || data?.health) {
          const health = data?.health as { status?: string } | undefined;
          const isHealthy = health?.status === "healthy" || data?.success;
          return (
            <SuccessCard
              title={isHealthy ? "Gateway Healthy" : "Gateway Status"}
              message={isHealthy ? "All services are operational." : "Some services may have issues."}
              variant={isHealthy ? "success" : "warning"}
            />
          );
        }
        // Only show error if there's an actual error in the response
        if (data?.error) {
          return <ErrorResult result={result} />;
        }
        // If we got here with no result or parsed successfully, show nothing
        if (!result || data) {
          return <></>;
        }
        return <ErrorResult result={result} />;
      },
    },
    []
  );
}
