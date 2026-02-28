export interface SessionRegistryOptions {
  ttlMs?: number;
  maxEntries?: number;
  cleanupIntervalMs?: number;
}

interface SessionEntry<T> {
  value: T;
  updatedAt: number;
}

/**
 * In-memory session registry with TTL and bounded size to prevent leaks.
 */
export class SessionRegistry<T> {
  private entries = new Map<string, SessionEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(options?: SessionRegistryOptions) {
    this.ttlMs = options?.ttlMs ?? 30 * 60 * 1000;
    this.maxEntries = options?.maxEntries ?? 5000;
    const cleanupIntervalMs = options?.cleanupIntervalMs ?? 60 * 1000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Do not keep the process alive just for periodic cleanup.
    this.cleanupTimer.unref();
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, updatedAt: Date.now() });
    if (this.entries.size > this.maxEntries) {
      // Bound memory growth under high churn.
      this.evictOldest();
    }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.updatedAt > this.ttlMs) {
      // Lazy eviction keeps hot-path logic simple.
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  size(): number {
    return this.entries.size;
  }

  stop(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (now - entry.updatedAt > this.ttlMs) {
        this.entries.delete(key);
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTs = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.entries.entries()) {
      if (entry.updatedAt < oldestTs) {
        oldestTs = entry.updatedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }
}
