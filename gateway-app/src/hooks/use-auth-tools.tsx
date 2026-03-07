"use client";

import { useDefaultTool } from "@copilotkit/react-core";
import { DefaultToolComponent } from "@/components/default-tool-ui";

/**
 * Default tool renderer for tools that don't have a custom renderer.
 *
 * Auth flow is now handled at the Gateway level (before the agent runs),
 * so tool results no longer contain auth_required responses.
 */
export function useAuthAwareDefaultTool() {
  useDefaultTool(
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (props: any) => {
        const { name, status, result, args } = props;
        return <DefaultToolComponent name={name} status={status} args={args} result={result} />;
      },
    },
    []
  );
}
