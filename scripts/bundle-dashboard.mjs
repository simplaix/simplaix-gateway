/**
 * Bundle the Next.js standalone output into dist/dashboard/ for npm publish.
 *
 * Next.js `output: 'standalone'` mirrors the full filesystem path inside the
 * standalone directory. In a monorepo the layout looks like:
 *
 *   gateway-app/.next/standalone/
 *     <absolute-path-to-repo>/
 *       node_modules/            ← monorepo-root deps (pruned)
 *       gateway-app/
 *         server.js              ← app entry point
 *         node_modules/          ← app-level deps (pruned)
 *         .next/
 *
 * This script:
 *   1. Finds server.js wherever it lives in the standalone tree
 *   2. Copies the app directory into dist/dashboard/
 *   3. Merges the monorepo-root node_modules into dist/dashboard/node_modules
 *      (so server.js can resolve all dependencies from a flat structure)
 *   4. Copies .next/static/ and public/ alongside it
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const STANDALONE = join(ROOT, 'gateway-app', '.next', 'standalone');
const STATIC = join(ROOT, 'gateway-app', '.next', 'static');
const PUBLIC = join(ROOT, 'gateway-app', 'public');
const OUT = join(ROOT, 'dist', 'dashboard');

if (!existsSync(STANDALONE)) {
  console.error('[bundle-dashboard] gateway-app/.next/standalone/ not found — did you run `next build`?');
  process.exit(1);
}

// ── Locate server.js inside the standalone tree ──────────────────────────────

function findFile(dir, name, maxDepth = 10) {
  if (maxDepth <= 0) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name, maxDepth - 1);
      if (found) return found;
    }
  }
  return null;
}

const serverJs = findFile(STANDALONE, 'server.js');
if (!serverJs) {
  console.error('[bundle-dashboard] server.js not found in standalone output');
  process.exit(1);
}

const appDir = dirname(serverJs);
console.log(`[bundle-dashboard] Found app at: ${appDir}`);

// Monorepo root node_modules lives one level above the gateway-app directory
const monoRootNodeModules = join(dirname(appDir), 'node_modules');

// ── Assemble output ──────────────────────────────────────────────────────────

if (existsSync(OUT)) {
  rmSync(OUT, { recursive: true });
}
mkdirSync(OUT, { recursive: true });

// 1. Copy the app directory (server.js + app-level node_modules + .next)
cpSync(appDir, OUT, { recursive: true });
console.log('[bundle-dashboard] Copied app directory');

// 2. Merge monorepo-root node_modules into dist/dashboard/node_modules.
//    Copy packages that don't already exist in the app-level node_modules
//    (app-level takes precedence).
if (existsSync(monoRootNodeModules)) {
  const appNodeModules = join(OUT, 'node_modules');
  mkdirSync(appNodeModules, { recursive: true });

  for (const entry of readdirSync(monoRootNodeModules, { withFileTypes: true })) {
    const dest = join(appNodeModules, entry.name);
    const src = join(monoRootNodeModules, entry.name);

    if (entry.name.startsWith('@')) {
      // Scoped package — merge at scope level
      mkdirSync(dest, { recursive: true });
      for (const sub of readdirSync(src, { withFileTypes: true })) {
        const subDest = join(dest, sub.name);
        if (!existsSync(subDest)) {
          cpSync(join(src, sub.name), subDest, { recursive: true });
        }
      }
    } else if (!existsSync(dest)) {
      cpSync(src, dest, { recursive: true });
    }
  }
  console.log('[bundle-dashboard] Merged monorepo-root node_modules');
}

// 3. Copy .next/static → dist/dashboard/.next/static
if (existsSync(STATIC)) {
  const staticDest = join(OUT, '.next', 'static');
  mkdirSync(staticDest, { recursive: true });
  cpSync(STATIC, staticDest, { recursive: true });
  console.log('[bundle-dashboard] Copied .next/static');
}

// 4. Copy public/ → dist/dashboard/public
if (existsSync(PUBLIC)) {
  mkdirSync(join(OUT, 'public'), { recursive: true });
  cpSync(PUBLIC, join(OUT, 'public'), { recursive: true });
  console.log('[bundle-dashboard] Copied public/');
}

console.log('[bundle-dashboard] Dashboard bundled → dist/dashboard/');
