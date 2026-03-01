import { z } from 'zod';

// Shared schema block so create/update keep credential shape consistent.
const requiredCredentialSchema = z.object({
  serviceType: z.string().min(1),
  scopes: z.array(z.string()).optional(),
  description: z.string().default(''),
});

export const createAgentInputSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  upstreamUrl: z.string().url('Invalid upstream URL format'),
  upstreamSecret: z.string().optional(),
  requireConfirmation: z.boolean().optional(),
  requiredCredentials: z.array(requiredCredentialSchema).optional(),
  tenantId: z.string().optional(),
  ownerUserId: z.string().optional(),
  description: z.string().optional(),
});

export const updateAgentInputSchema = z.object({
  name: z.string().optional(),
  upstreamUrl: z.string().url('Invalid upstream URL format').optional(),
  upstreamSecret: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  requireConfirmation: z.boolean().optional(),
  requiredCredentials: z.array(requiredCredentialSchema).nullable().optional(),
  description: z.string().nullable().optional(),
});
