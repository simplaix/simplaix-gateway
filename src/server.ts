/**
 * Long-running development server using @hono/node-server.
 *
 * Unlike `vc dev` (serverless simulation where every request cold-starts),
 * this keeps the process alive so module-level singletons (DB connection,
 * config cache, etc.) persist across requests — eliminating the ~50-200ms
 * initialisation overhead per request.
 *
 * Usage:  pnpm dev:server
 */

import { serve } from '@hono/node-server';
import app from './index.js';

const port = parseInt(process.env.PORT || '3001', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[Gateway] Listening on http://localhost:${info.port}`);
});
