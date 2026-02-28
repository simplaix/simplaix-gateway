import type { CredentialProviderConfig } from '../../types/index.js';

export const MASKED_SECRET = '********';

// Keys that must never be returned as plaintext in API responses.
const SENSITIVE_KEYS = new Set([
  'secret',
  'clientSecret',
  'apiSecret',
  'privateKey',
  'password',
  'authSecret',
  'refreshToken',
  'accessToken',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMaskedSecret(value: unknown): boolean {
  return typeof value === 'string' && (/^\*{3,}$/.test(value) || value === MASKED_SECRET);
}

export function redactSecrets<T>(input: T): T {
  if (Array.isArray(input)) {
    // Recurse through arrays so nested config blocks are also protected.
    return input.map((item) => redactSecrets(item)) as T;
  }
  if (!isObject(input)) {
    return input;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
      result[key] = MASKED_SECRET;
      continue;
    }
    // Recurse into nested objects to ensure full-tree redaction.
    result[key] = redactSecrets(value);
  }
  return result as T;
}

export function mergeMaskedSecrets<T>(
  nextConfig: T | null | undefined,
  currentConfig: T | null | undefined
): T | null | undefined {
  // Preserve explicit clear/reset semantics from callers.
  if (nextConfig === undefined) return undefined;
  if (nextConfig === null) return null;

  if (Array.isArray(nextConfig)) {
    return nextConfig as T;
  }

  if (!isObject(nextConfig)) {
    if (isMaskedSecret(nextConfig)) {
      // Mask placeholder means "keep existing secret".
      return currentConfig;
    }
    return nextConfig;
  }

  const current: Record<string, unknown> = isObject(currentConfig) ? currentConfig : {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(nextConfig)) {
    const currentValue = current[key];
    if (isMaskedSecret(value)) {
      // Apply preserve behavior at any nested level.
      result[key] = currentValue;
      continue;
    }
    result[key] = mergeMaskedSecrets(value, currentValue);
  }
  return result as T;
}

export function redactCredentialProviderConfig(
  config: CredentialProviderConfig | undefined
): CredentialProviderConfig | undefined {
  if (!config) return config;
  return redactSecrets(config);
}
