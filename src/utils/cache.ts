/**
 * Simple in-memory TTL cache.
 *
 * Used to avoid repeated DB reads for data that changes infrequently
 * (providers, access rules, agent tokens). Each service owns its own
 * cache instance and invalidates on mutations.
 */

export class TTLCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Delete a specific key, or clear the entire cache if no key is provided. */
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}
