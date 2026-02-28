import { NextRequest, NextResponse } from "next/server";
import { signJWT, verifyJWTLocal } from "@/lib/jwt";

const GATEWAY_API_URL = process.env.GATEWAY_API_URL || "http://localhost:3000";

/**
 * POST /api/auth/refresh
 *
 * 1. Verify the current JWT locally
 * 2. Fetch fresh user data from gateway core's /auth/me
 * 3. Sign a new JWT with up-to-date claims
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing Authorization header" },
      { status: 401 },
    );
  }

  try {
    await verifyJWTLocal(token);
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 },
    );
  }

  try {
    const meRes = await fetch(`${GATEWAY_API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch user profile" },
        { status: meRes.status },
      );
    }

    const data = await meRes.json();
    const { user } = data;

    if (!user.isActive) {
      return NextResponse.json(
        { error: "User account is disabled" },
        { status: 403 },
      );
    }

    const newToken = await signJWT(user);

    return NextResponse.json({ success: true, token: newToken, user });
  } catch (error) {
    console.error("[Auth] Refresh error:", error);
    return NextResponse.json(
      { error: "Token refresh failed" },
      { status: 502 },
    );
  }
}
