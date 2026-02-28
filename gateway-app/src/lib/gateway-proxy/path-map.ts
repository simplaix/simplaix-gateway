/**
 * Gateway route mapping
 *
 * Maps simplified frontend paths (e.g. "agents", "agents/:id/enable")
 * to the actual gateway backend API paths.
 */

interface RouteRule {
  /** Regex to match against the joined path. */
  pattern: RegExp;
  /** Build the backend path. Receives the original path segments and the joined path string. */
  build: (segments: string[], joined: string) => string;
}

/**
 * Ordered list of route rules.
 * The first matching rule wins — put more specific patterns before broader ones.
 */
const routes: RouteRule[] = [
  // Agents
  { pattern: /^agents\/([^/]+)\/enable$/,            build: (s) => `/api/v1/admin/agents/${s[1]}/enable` },
  { pattern: /^agents\/([^/]+)\/disable$/,           build: (s) => `/api/v1/admin/agents/${s[1]}/disable` },
  { pattern: /^agents\/([^/]+)\/regenerate-token$/,  build: (s) => `/api/v1/admin/agents/${s[1]}/regenerate-token` },
  { pattern: /^agents\/([^/]+)$/,                    build: (s) => `/api/v1/admin/agents/${s[1]}` },
  { pattern: /^agents$/,                             build: ()  => "/api/v1/admin/agents" },

  // API Keys
  { pattern: /^api-keys\/([^/]+)$/,                  build: (s) => `/api/v1/admin/api-keys/${s[1]}` },
  { pattern: /^api-keys$/,                           build: ()  => "/api/v1/admin/api-keys" },

  // Tool Providers
  { pattern: /^providers\/([^/]+)\/tools$/,          build: (s) => `/api/v1/admin/tool-providers/${s[1]}/tools` },
  { pattern: /^providers\/([^/]+)$/,                 build: (s) => `/api/v1/admin/tool-providers/${s[1]}` },
  { pattern: /^providers$/,                          build: ()  => "/api/v1/admin/tool-providers" },

  // Provider Access / Policies
  { pattern: /^provider-access\/agent\/([^/]+)$/,    build: (s) => `/api/v1/admin/provider-access/agent/${s[2]}` },
  { pattern: /^provider-access\/evaluate$/,          build: ()  => "/api/v1/admin/provider-access/evaluate" },
  { pattern: /^provider-access\/by-provider\/([^/]+)$/, build: (s) => `/api/v1/admin/provider-access/by-provider/${s[1]}` },
  { pattern: /^provider-access\/([^/]+)$/,           build: (s) => `/api/v1/admin/provider-access/${s[1]}` },
  { pattern: /^provider-access$/,                    build: ()  => "/api/v1/admin/provider-access" },

  // Confirmations
  { pattern: /^confirmations\/([^/]+)\/confirm$/,    build: (s) => `/api/v1/confirmation/${s[1]}/confirm` },
  { pattern: /^confirmations\/([^/]+)\/reject$/,     build: (s) => `/api/v1/confirmation/${s[1]}/reject` },
  { pattern: /^confirmations\/([^/]+)\/respond$/,    build: (s) => `/api/v1/confirmation/${s[1]}/respond` },
  { pattern: /^confirmations$/,                      build: ()  => "/api/v1/confirmation/list" },

  // Audit
  { pattern: /^audit\/logs$/,                        build: ()  => "/api/v1/audit/logs" },
  { pattern: /^audit\/stats$/,                       build: ()  => "/api/v1/audit/stats" },

  // Health
  { pattern: /^health$/,                             build: ()  => "/api/health" },

  // Pass-through routes (credentials, credential-providers, auth)
  { pattern: /^(credentials|credential-providers|auth)(\/|$)/, build: (_, p) => `/api/v1/${p}` },
];

/**
 * Resolve a frontend proxy path to the backend gateway path.
 *
 * @param pathSegments - The dynamic route segments from `[...path]`
 * @returns The full backend path (e.g. `/api/v1/admin/agents`)
 */
export function mapPath(pathSegments: string[]): string {
  const joined = pathSegments.join("/");

  for (const route of routes) {
    if (route.pattern.test(joined)) {
      return route.build(pathSegments, joined);
    }
  }

  // Default: pass through under /api/v1/
  return `/api/v1/${joined}`;
}
