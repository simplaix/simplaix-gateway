import { auditService } from '../audit.service/index.js';
import { logger } from '../../utils/logger.js';

export async function forwardToUpstream(opts: {
  upstreamUrl: string;
  method: 'POST' | 'GET' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  auditPromise?: Promise<string | undefined>;
  startTime?: number;
  providerName?: string;
}): Promise<Response> {
  const { upstreamUrl, method, headers, body, auditPromise, startTime, providerName } = opts;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === 'POST' ? body : undefined,
    });

    if (method === 'DELETE') {
      return new Response(null, { status: upstreamResponse.status });
    }

    const contentType = upstreamResponse.headers.get('Content-Type') || '';
    const sessionId = upstreamResponse.headers.get('Mcp-Session-Id');

    const responseHeaders: Record<string, string> = {};
    if (contentType) responseHeaders['Content-Type'] = contentType;
    if (sessionId) responseHeaders['Mcp-Session-Id'] = sessionId;

    if (contentType.includes('text/event-stream')) {
      responseHeaders['Cache-Control'] = 'no-cache';
      responseHeaders['Connection'] = 'keep-alive';

      if (auditPromise && startTime) {
        const duration = Date.now() - startTime;
        auditPromise.then((id) => {
          if (id) auditService.updateStatus(id, 'completed', undefined, duration).catch(() => {});
        });
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    const responseBody = await upstreamResponse.text();

    if (auditPromise && startTime) {
      const duration = Date.now() - startTime;
      let auditStatus: 'completed' | 'failed' = upstreamResponse.ok ? 'completed' : 'failed';
      let auditResult: unknown;
      try {
        const jsonResult = JSON.parse(responseBody);
        if (jsonResult.error) {
          auditStatus = 'failed';
          auditResult = jsonResult.error;
        } else {
          auditResult = jsonResult.result;
        }
      } catch {
        // not JSON
      }
      auditPromise.then((id) => {
        if (id) auditService.updateStatus(id, auditStatus, auditResult, duration).catch(() => {});
      });
    }

    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    logger.error(`[MCPProxy] Upstream ${method} failed for provider ${providerName || 'unknown'}:`, error);

    if (auditPromise && startTime) {
      const duration = Date.now() - startTime;
      auditPromise.then((id) => {
        if (id) auditService.updateStatus(id, 'failed', { error: String(error) }, duration).catch(() => {});
      });
    }

    return Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `Upstream MCP server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      },
      { status: 502 }
    );
  }
}
