import { createHmac } from 'node:crypto';

export function computeInternalToken(jwtSecret: string): string {
  return createHmac('sha256', jwtSecret)
    .update('gateway-internal-mcp-v1')
    .digest('hex');
}
