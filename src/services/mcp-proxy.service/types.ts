import type { Context } from 'hono';
import type { GatewayVariables, ToolProvider } from '../../types/index.js';

export interface ProxyIdentity {
  user: { id: string; tenantId?: string; email?: string; roles?: string[] };
  agent?: { id: string; name: string } | null;
  endUserId: string;
  endUserRoles: string[];
  endUserTenantId?: string;
}

export type PolicyDecision =
  | { type: 'deny'; jsonRpcResponse: object }
  | { type: 'require_confirmation'; sseHandler: (c: Context<{ Variables: GatewayVariables }>) => Response }
  | { type: 'allow'; auditPromise: Promise<string | undefined> }
  | { type: 'exempt'; auditPromise: Promise<string | undefined> };

export interface EvaluateToolCallPolicyOptions {
  identity: ProxyIdentity;
  provider: ToolProvider;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  jsonRpcId: unknown;
  body: string;
  upstreamUrl: string;
  forwardHeaders: Record<string, string>;
  startTime: number;
}
