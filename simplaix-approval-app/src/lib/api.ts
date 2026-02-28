import { getGatewayUrl, getAuthToken } from './storage';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ConfirmationEvent {
  id: string;
  tool: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    provider?: { id: string; name: string };
  };
  arguments: Record<string, unknown>;
  risk: { level: RiskLevel };
  agent?: { id: string; name: string };
  user?: { id: string; endUserId?: string };
  tenantId?: string;
  timestamp: string;
}

/**
 * Normalize a raw API response item into the ConfirmationEvent shape.
 * The /pending endpoint returns flat fields (tool as string, risk as string)
 * while the SSE event uses nested objects.
 */
function normalizeConfirmation(raw: Record<string, unknown>): ConfirmationEvent {
  const toolRaw = raw.tool;
  const tool =
    typeof toolRaw === 'string'
      ? { name: toolRaw }
      : (toolRaw as ConfirmationEvent['tool']) ?? { name: 'unknown' };

  const riskRaw = raw.risk;
  const risk =
    typeof riskRaw === 'string'
      ? { level: riskRaw as RiskLevel }
      : (riskRaw as ConfirmationEvent['risk']) ?? { level: 'low' as RiskLevel };

  return {
    id: (raw.id ?? raw.confirmation_id ?? '') as string,
    tool,
    arguments: (raw.arguments ?? {}) as Record<string, unknown>,
    risk,
    agent: raw.agent_id
      ? { id: raw.agent_id as string, name: (raw.agent_name as string) ?? '' }
      : (raw.agent as ConfirmationEvent['agent']),
    user: raw.user_id
      ? { id: raw.user_id as string, endUserId: raw.end_user_id as string | undefined }
      : (raw.user as ConfirmationEvent['user']),
    tenantId: (raw.tenantId ?? raw.tenant_id) as string | undefined,
    timestamp: (raw.timestamp ?? raw.created_at ?? new Date().toISOString()) as string,
  };
}

class GatewayApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = await getGatewayUrl();
  const token = await getAuthToken();

  if (!baseUrl || !token) {
    throw new GatewayApiError(0, 'Gateway URL or auth token not configured. Go to Settings.');
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GatewayApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

export async function fetchPendingConfirmations(): Promise<ConfirmationEvent[]> {
  const result = await request<{ data: Record<string, unknown>[] }>('/confirmation/pending');
  return result.data.map(normalizeConfirmation);
}

export async function fetchConfirmation(id: string): Promise<ConfirmationEvent> {
  const raw = await request<Record<string, unknown>>(`/confirmation/${id}`);
  // The /:id endpoint returns the object directly (no `data` wrapper)
  const inner = (raw.data ?? raw) as Record<string, unknown>;
  return normalizeConfirmation(inner);
}

export async function confirmRequest(id: string): Promise<void> {
  await request(`/confirmation/${id}/confirm`, { method: 'POST' });
}

export async function rejectRequest(id: string, reason?: string): Promise<void> {
  await request(`/confirmation/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function registerDevice(params: {
  platform: string;
  pushToken: string;
  deviceName?: string;
}): Promise<{ id: string }> {
  const result = await request<{ data: { id: string } }>('/notifications/devices', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return result.data;
}

/**
 * Exchange a pairing token for a device JWT.
 * Standalone fetch — does not use stored credentials.
 */
export async function exchangePairingToken(params: {
  gatewayUrl: string;
  pairingToken: string;
  pushToken: string;
  platform: string;
  deviceName?: string;
}): Promise<{ token: string; gatewayUrl: string; peerId: string }> {
  const url = `${params.gatewayUrl.replace(/\/+$/, '')}/api/v1/auth/pair`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairingToken: params.pairingToken,
      pushToken: params.pushToken,
      platform: params.platform,
      deviceName: params.deviceName,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GatewayApiError(res.status, body);
  }

  return res.json() as Promise<{ token: string; gatewayUrl: string; peerId: string }>;
}

/** Quick connectivity check — returns true if gateway responds to /health */
export async function checkConnection(): Promise<boolean> {
  try {
    const baseUrl = await getGatewayUrl();
    const token = await getAuthToken();
    if (!baseUrl || !token) return false;

    const url = `${baseUrl.replace(/\/+$/, '')}/api/health`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
