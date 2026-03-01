import { NextRequest, NextResponse } from "next/server";
import { signJWT } from "@/lib/jwt";

const GATEWAY_API_URL = process.env.GATEWAY_API_URL || "http://localhost:3000";

/**
 * POST /api/auth/login
 *
 * 1. Forward credentials to gateway core's /verify-credentials endpoint
 * 2. If valid, sign a JWT locally and return it
 */
export async function POST(req: NextRequest) {
  let body: { email: string; password: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  try {
    const verifyRes = await fetch(
      `${GATEWAY_API_URL}/api/v1/auth/verify-credentials`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: body.email, password: body.password }),
      },
    );

    const data = await verifyRes.json();

    if (!verifyRes.ok) {
      return NextResponse.json(
        { error: data.error || "Authentication failed" },
        { status: verifyRes.status },
      );
    }

    const { user } = data;
    const token = await signJWT(user);

    return NextResponse.json({ success: true, token, user });
  } catch (error) {
    console.error("[Auth] Login error:", error);
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 502 },
    );
  }
}
