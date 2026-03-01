/**
 * Request / response transformations for the gateway proxy.
 *
 * Bridges the gap between the frontend API client's expected shapes
 * and the backend gateway's actual response formats.
 */

// ---------------------------------------------------------------------------
// Request body transforms
// ---------------------------------------------------------------------------

/**
 * Transform the request body before forwarding to the backend.
 * Currently a pass-through — kept as a hook for future field renaming.
 */
export function transformRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body };
}

// ---------------------------------------------------------------------------
// Response transforms
// ---------------------------------------------------------------------------

/** Extract the items array from a response (handles raw arrays and `{ data: [] }` wrappers). */
function unwrapArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  const obj = data as Record<string, unknown> | null;
  if (obj?.data && Array.isArray(obj.data)) return obj.data;
  return null;
}

/** Wrap an array response as `{ <key>: items[], count }`. */
function wrapList(key: string, data: unknown): Record<string, unknown> | null {
  const items = unwrapArray(data);
  if (!items) return null;
  const obj = data as Record<string, unknown>;
  const total = (obj.pagination as Record<string, number> | undefined)?.total;
  return { [key]: items, count: total ?? items.length };
}

/** Map of list-endpoint paths → the key the frontend expects. */
const LIST_ROUTES: Record<string, string> = {
  agents: "agents",
  providers: "providers",
  confirmations: "confirmations",
  "audit/logs": "logs",
};

/** Reshape backend audit stats into the frontend `AuditStats` interface. */
function transformAuditStats(data: unknown): Record<string, unknown> {
  const obj = data as Record<string, unknown>;
  const stats = (obj.data ?? obj) as Record<string, unknown>;
  const byStatus = (stats.byStatus ?? {}) as Record<string, number>;
  const total = (stats.total as number) || 0;
  const completed = byStatus.completed || 0;

  return {
    totalCalls: total,
    completedCalls: completed,
    failedCalls: byStatus.failed || 0,
    pendingCalls: byStatus.pending || 0,
    avgDuration: (stats.avgDuration as number) || 0,
    successRate: total > 0 ? completed / total : 0,
  };
}

/**
 * Transform a backend response to match what the frontend API client expects.
 *
 * @param data       - The parsed JSON body from the backend
 * @param pathSegments - The dynamic route segments from `[...path]`
 */
export function transformResponse(data: unknown, pathSegments: string[]): unknown {
  const joined = pathSegments.join("/");

  // List endpoints — normalise to { <key>: items[], count }
  if (joined in LIST_ROUTES) {
    return wrapList(LIST_ROUTES[joined], data) ?? data;
  }

  // Audit stats — reshape to frontend AuditStats
  if (joined === "audit/stats") {
    return transformAuditStats(data);
  }

  return data;
}
