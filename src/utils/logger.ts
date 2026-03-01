/**
 * Lightweight log-level gating.
 *
 * Set `LOG_LEVEL` env var to one of: debug | info | warn | error
 * Default is "info".
 *
 * `logger.debug(...)` — only printed when LOG_LEVEL=debug
 * `logger.info(...)`  — printed at debug, info
 * `logger.warn(...)`  — printed at debug, info, warn
 * `logger.error(...)` — always printed
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

function currentLevel(): number {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase() as Level;
  return LEVELS[env] ?? LEVELS.info;
}

export const logger = {
  debug(...args: unknown[]): void {
    if (currentLevel() <= LEVELS.debug) console.debug(...args);
  },
  info(...args: unknown[]): void {
    if (currentLevel() <= LEVELS.info) console.log(...args);
  },
  warn(...args: unknown[]): void {
    if (currentLevel() <= LEVELS.warn) console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
