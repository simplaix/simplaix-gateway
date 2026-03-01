import test from 'node:test';
import assert from 'node:assert/strict';

import { SessionRegistry } from '../../src/modules/session/session-registry.js';

test('session registry evicts expired entries', async () => {
  // TTL expiration must clear stale mappings to prevent unbounded growth.
  const registry = new SessionRegistry<{ id: string }>({
    ttlMs: 20,
    cleanupIntervalMs: 10,
    maxEntries: 10,
  });

  registry.set('a', { id: 'a' });
  assert.deepEqual(registry.get('a'), { id: 'a' });

  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(registry.get('a'), undefined);
  registry.stop();
});

test('session registry enforces max entries', () => {
  // Capacity bound keeps memory predictable under high session churn.
  const registry = new SessionRegistry<number>({
    ttlMs: 60_000,
    cleanupIntervalMs: 60_000,
    maxEntries: 2,
  });

  registry.set('k1', 1);
  registry.set('k2', 2);
  registry.set('k3', 3);

  assert.equal(registry.size(), 2);
  registry.stop();
});
