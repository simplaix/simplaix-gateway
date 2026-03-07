import type { Context } from 'hono';

export async function parseJsonBody<T>(
  c: Context
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  try {
    const data = await c.req.json<T>();
    return { ok: true, data };
  } catch {
    // Keep a consistent 400 payload for malformed JSON across routes.
    return {
      ok: false,
      response: c.json({ error: 'Invalid JSON body' }, 400),
    };
  }
}
