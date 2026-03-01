import type * as jose from 'jose';

export interface JWTPayload extends jose.JWTPayload {
  sub: string;
  tenant_id?: string;
  email?: string;
  roles?: string[];
}

export interface SessionJWTPayload {
  userId: string;
  agentId: string;
  tenantId?: string;
  roles?: string[];
  email?: string;
  requestId: string;
}
