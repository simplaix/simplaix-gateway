import { nanoid } from 'nanoid';
import { verifySessionJWT } from '../auth.service/index.js';
import { logger } from '../../utils/logger.js';

export function buildUpstreamHeaders(
  user: { id: string; tenantId?: string; email?: string; roles?: string[] },
  provider: { authType: string; authSecret?: string },
  agent?: { id: string; name: string } | null
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-User-ID': user.id,
    'X-Gateway-Request-ID': nanoid(),
  };

  if (user.tenantId) {
    headers['X-Tenant-ID'] = user.tenantId;
  }
  if (user.email) {
    headers['X-User-Email'] = user.email;
  }
  if (user.roles && user.roles.length > 0) {
    headers['X-User-Roles'] = user.roles.join(',');
  }

  if (agent) {
    headers['X-Gateway-Agent-ID'] = agent.id;
    headers['X-Gateway-Agent-Name'] = agent.name;
  }

  if (provider.authType === 'bearer' && provider.authSecret) {
    headers['Authorization'] = `Bearer ${provider.authSecret}`;
  } else if (provider.authType === 'api_key' && provider.authSecret) {
    headers['X-API-Key'] = provider.authSecret;
  }

  return headers;
}

export async function resolveEndUserIdentity(
  user: { id: string; tenantId?: string; roles?: string[] },
  sessionToken?: string | null,
  endUserIdHeader?: string | null
): Promise<{ endUserId: string; endUserRoles: string[]; endUserTenantId?: string }> {
  let endUserId = user.id;
  let endUserRoles = user.roles || [];
  let endUserTenantId = user.tenantId;

  if (sessionToken) {
    try {
      const session = await verifySessionJWT(sessionToken);
      endUserId = session.userId;
      endUserRoles = session.roles || endUserRoles;
      endUserTenantId = session.tenantId || endUserTenantId;
      logger.info(
        `[MCPProxy] Session token verified: endUser=${endUserId}, agent=${session.agentId}, requestId=${session.requestId}, roles=${(endUserRoles || []).join(',')}`
      );
    } catch (e) {
      logger.warn(`[MCPProxy] Invalid session token, falling back to agent identity: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    endUserId = endUserIdHeader || user.id;
    logger.debug(`[MCPProxy] No session token, using endUserId=${endUserId} (from header or agent identity)`);
  }

  return { endUserId, endUserRoles, endUserTenantId };
}
