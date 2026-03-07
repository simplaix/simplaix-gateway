/**
 * Shared glob pattern matching utility
 * Converts glob patterns (with * and ? wildcards) to regex for tool name matching
 */

/**
 * Convert a glob pattern to a RegExp.
 * Supports `*` (any characters) and `?` (single character) wildcards.
 */
function globToRegex(pattern: string): RegExp {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexPattern}$`, 'i');
}

/**
 * Check if a name matches a glob pattern.
 * Supports `*` (any chars) and `?` (single char) wildcards. Case-insensitive.
 * Also supports comma-separated patterns (e.g. "list_agents,create_agent").
 */
export function matchGlobPattern(name: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === name) return true;
  if (pattern.includes(',')) {
    return pattern.split(',').some((p) => matchGlobPattern(name, p.trim()));
  }
  return globToRegex(pattern).test(name);
}

/**
 * Score a glob pattern's specificity against a name.
 * Returns -1 if no match. Higher scores = more specific.
 *   3 = exact match
 *   2 = glob pattern match (e.g. 'slack_send_*')
 *   1 = wildcard '*'
 *  -1 = no match
 * For comma-separated patterns, returns the highest score among matching sub-patterns.
 */
export function globPatternSpecificity(pattern: string, name: string): number {
  if (pattern === '*') return 1;
  if (pattern === name) return 3;
  if (pattern.includes(',')) {
    let best = -1;
    for (const p of pattern.split(',')) {
      const score = globPatternSpecificity(p.trim(), name);
      if (score > best) best = score;
    }
    return best;
  }
  if (globToRegex(pattern).test(name)) return 2;
  return -1;
}
