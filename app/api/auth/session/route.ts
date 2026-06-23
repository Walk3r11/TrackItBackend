import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

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
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie");
  let token: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) token = cookieMatch[1];
  }

  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401, headers: corsHeaders });
  }

  try {
    const tokenHash = hashToken(token);
    const rows = (await sql`
      select
        s.id,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.balance,
        u.monthly_spend,
        u.last_active,
        u.created_at
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${tokenHash}
        and s.revoked_at is null
        and s.expires_at > now()
      limit 1
    `) as {
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      balance: string | number | null;
      monthly_spend: string | number | null;
      last_active: string | null;
      created_at: string;
    }[];

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    }

    const toNumber = (value: string | number | null) => Number(value ?? 0);
    const user = {
      id: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      balance: toNumber(row.balance),
      monthlySpend: toNumber(row.monthly_spend),
      lastActive: row.last_active,
      createdAt: row.created_at
    };

    return NextResponse.json({ ok: true, user }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to validate session" }, { status: 500, headers: corsHeaders });
  }
}
