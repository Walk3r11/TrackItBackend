import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
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
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
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

    return NextResponse.json({ ok: true, user }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to validate session" }, { status: 500 });
  }
}
