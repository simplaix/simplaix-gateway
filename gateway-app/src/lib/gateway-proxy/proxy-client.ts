/**
 * Core proxy client — forwards requests to the gateway backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { mapPath } from "./path-map";
import { transformRequestBody, transformResponse } from "./transforms";

const GATEWAY_API_URL = process.env.GATEWAY_API_URL || "http://localhost:3000";
const GATEWAY_JWT_TOKEN = process.env.GATEWAY_JWT_TOKEN || "";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Resolve the JWT token for an incoming request.
 * Prefers the Authorization header; falls back to the env var (dev mode).
 */
function getAuthToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return GATEWAY_JWT_TOKEN || null;
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

/**
 * Forward a Next.js request to the gateway backend and return the
 * (optionally transformed) response.
 */
export async function proxyRequest(
  req: NextRequest,
  pathSegments: string[],
  method: string,
): Promise<NextResponse> {
  const gatewayPath = mapPath(pathSegments);
  const searchParams = req.nextUrl.searchParams.toString();
  const fullUrl = searchParams
    ? `${GATEWAY_API_URL}${gatewayPath}?${searchParams}`
    : `${GATEWAY_API_URL}${gatewayPath}`;

  // --- Build fetch options ---------------------------------------------------
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const token = getAuthToken(req);
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const options: RequestInit = { method, headers };

  if (METHODS_WITH_BODY.has(method)) {
    try {
      const body = await req.json();
      options.body = JSON.stringify(transformRequestBody(body));
    } catch {
      // No body or invalid JSON — acceptable for some requests
    }
  }

  // --- Execute ---------------------------------------------------------------
  try {
    const response = await fetch(fullUrl, options);
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data.message || data.error || `Gateway error: ${response.status}`,
          details: data,
        },
        { status: response.status },
      );
    }

    return NextResponse.json(transformResponse(data, pathSegments));
  } catch (error) {
    console.error("Gateway proxy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gateway connection error" },
      { status: 502 },
    );
  }
}
