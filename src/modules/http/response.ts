import type { Context } from 'hono';

export function jsonError(
  c: Context,
  status: number,
  error: string,
  message?: string,
  code?: string
): Response {
  // Standardize error payload shape so callers can depend on error/message/code.
  return c.json(
    {
      error,
      ...(message ? { message } : {}),
      ...(code ? { code } : {}),
    },
    status as 400 | 401 | 403 | 404 | 409 | 500 | 501 | 502
  );
}

export function jsonSuccess<T extends Record<string, unknown>>(
  c: Context,
  body: T,
  status: number = 200
): Response {
  // Keep success responses explicit and typed at the call site.
  return c.json(body, status as 200 | 201);
}
