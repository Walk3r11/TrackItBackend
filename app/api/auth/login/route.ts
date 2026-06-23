import { NextResponse } from "next/server";
import { getAppUserAuth, findAppUserByEmail } from "@/lib/data";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { generateSessionToken, hashToken } from "@/lib/tokens";

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

const minPasswordLength = 8;
const passwordPolicy = {
  upper: /[A-Z]/,
  lower: /[a-z]/,
  number: /[0-9]/,
  special: /[^A-Za-z0-9]/
};

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const body = (await request.json()) as Payload;
  const authHeader = request.headers.get("authorization");
  const secret = process.env.JWT_SECRET || "trackit-secret";
  const currentPepper = process.env.HASH_PEPPER_CURRENT;
  const previousPepper = process.env.HASH_PEPPER_PREVIOUS;

  let email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const { payload } = await jwtVerify(bearerToken, new TextEncoder().encode(secret));
      if (payload.typ !== "pre_auth") {
        return NextResponse.json({ error: "Invalid auth token" }, { status: 401, headers: corsHeaders });
      }
      if (typeof payload.email === "string") email = payload.email.toLowerCase();
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401, headers: corsHeaders });
    }
  } else {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401, headers: corsHeaders });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400, headers: corsHeaders });
  }
  if (
    password.length < minPasswordLength ||
    !passwordPolicy.upper.test(password) ||
    !passwordPolicy.lower.test(password) ||
    !passwordPolicy.number.test(password) ||
    !passwordPolicy.special.test(password)
  ) {
    return NextResponse.json(
      { error: "Password must be 8+ chars with upper, lower, number, and special. Reset your password." },
      { status: 400, headers: corsHeaders }
    );
  }

  const authRow = await getAppUserAuth(email);
  if (!authRow) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
  }
  if (authRow.email_verified === false) {
    return NextResponse.json({ error: "Email not verified" }, { status: 403, headers: corsHeaders });
  }

  if (!currentPepper) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: corsHeaders });
  }

  const peppers: Array<{ value: string; version: "current" | "previous" }> = [
    { value: currentPepper, version: "current" as const },
    ...(previousPepper ? [{ value: previousPepper, version: "previous" as const }] : [])
  ];

  let verified = false;
  let usedVersion: "current" | "previous" | null = null;
  for (const p of peppers) {
    const ok = await bcrypt.compare(p.value + password, authRow.password_hash);
    if (ok) {
      verified = true;
      usedVersion = p.version;
      break;
    }
  }
  if (!verified) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
  }

  if (usedVersion === "previous") {
    const newHash = await bcrypt.hash(currentPepper + password, 12);
    await sql`update users set password_hash = ${newHash} where id = ${authRow.id}`;
  }

  const user = await findAppUserByEmail(email);
  const sessionToken = generateSessionToken();
  const tokenHash = hashToken(sessionToken);
  await sql`
    insert into auth_sessions (user_id, token_hash, expires_at)
    values (${authRow.id}, ${tokenHash}, now() + interval '60 days')
  `;
  const response = NextResponse.json({ token: sessionToken, user }, { status: 200, headers: corsHeaders });
  response.cookies.set("auth-token", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 60 * 60 * 24 * 60,
    path: "/"
  });
  return response;
}
