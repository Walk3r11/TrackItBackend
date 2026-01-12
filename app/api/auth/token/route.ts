import { NextResponse } from "next/server";
import { SignJWT } from "jose";

type Payload = {
  email?: string;
  password?: string;
};

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "https://www.trackitco.com",
    "https://trackitco.com",
    "http://localhost:3000",
  ];

  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const body = (await request.json()) as Payload;
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400, headers: corsHeaders });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: corsHeaders });
  }

  try {
    const token = await new SignJWT({ email, password })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30m")
      .sign(new TextEncoder().encode(secret));

    return NextResponse.json({ token }, { status: 200, headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: "Failed to issue token" }, { status: 500, headers: corsHeaders });
  }
}
