/**
 * Gateway API Proxy Route
 *
 * Proxies requests from the Next.js frontend to the simplaix-gateway backend.
 * All heavy lifting (path mapping, auth, transforms) lives in lib/gateway-proxy.
 */

import { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/gateway-proxy";

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  return proxyRequest(req, (await params).path, "GET");
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  return proxyRequest(req, (await params).path, "POST");
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  return proxyRequest(req, (await params).path, "PUT");
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  return proxyRequest(req, (await params).path, "DELETE");
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return proxyRequest(req, (await params).path, "PATCH");
}
