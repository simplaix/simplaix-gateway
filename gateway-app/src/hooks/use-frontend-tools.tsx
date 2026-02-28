"use client";

import { useFrontendTool } from "@copilotkit/react-core";
import { DashboardState, initialDashboardState } from "@/types";

export function useFrontendTools(
  setState: (newState: DashboardState | ((prevState: DashboardState | undefined) => DashboardState)) => void
) {
  useFrontendTool({
    name: "navigate_to_tab",
    parameters: [
      {
        name: "tab_name",
        description: "The tab to navigate to: agents, tokens, providers, confirmations, audit",
        required: true,
      },
    ],
    handler({ tab_name }) {
      setState((prev) => ({ ...initialDashboardState, ...prev, activeTab: tab_name }));
    },
  });

  useFrontendTool({
    name: "select_agent",
    parameters: [
      {
        name: "agent_id",
        description: "The ID of the agent to select",
        required: true,
      },
    ],
    handler({ agent_id }) {
      setState((prev) => ({
        ...initialDashboardState,
        ...prev,
        selectedAgentId: agent_id,
        activeTab: "tokens"
      }));
    },
  });

  useFrontendTool({
    name: "refresh_dashboard",
    parameters: [],
    handler() {
      setState((prev) => ({
        ...initialDashboardState,
        ...prev,
        loading: {
          agents: true,
          tokens: true,
          providers: true,
          confirmations: true,
          audit: true,
        },
      }));
      setTimeout(() => {
        setState((prev) => ({
          ...initialDashboardState,
          ...prev,
          loading: {
            agents: false,
            tokens: false,
            providers: false,
            confirmations: false,
            audit: false,
          },
        }));
      }, 500);
    },
  });
}
