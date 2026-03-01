"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { useAuth } from "@/contexts/auth-context";
import { useMemo } from "react";

/**
 * CopilotKit provider that forwards the user's JWT to the agent.
 *
 * Sends the upstream application's JWT as a standard Authorization header.
 * The CopilotKit runtime route forwards this header to the Gateway, which
 * verifies the JWT (gateway-issued or external issuer) and extracts
 * sub/tenant_id/roles to establish user identity.
 */
export function CopilotKitProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="gateway_agent"
      headers={headers}
    >
      {children}
    </CopilotKit>
  );
}
