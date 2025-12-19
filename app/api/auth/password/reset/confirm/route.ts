import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import bcrypt from "bcryptjs";

type Payload = {
  email?: string;
  token?: string;
  newPassword?: string;
};

const minPasswordLength = 8;
const passwordPolicy = {
  upper: /[A-Z]/,
  lower: /[a-z]/,
  number: /[0-9]/,
  special: /[^A-Za-z0-9]/
};

const normalizeUrl = (value?: string | null) => (value ? value.replace(/\/+$/, "") : null);

const appUrl = normalizeUrl(process.env.APP_URL);
const allowedOrigins = (() => {
  const origins = new Set<string>();
  if (appUrl) {
    origins.add(appUrl);
    if (appUrl.includes("://www.")) {
      origins.add(appUrl.replace("://www.", "://"));
    } else {
      origins.add(appUrl.replace("://", "://www."));
    }
  }
  return origins;
})();

function getCorsHeaders(origin: string | null) {
  const resolvedOrigin = origin && allowedOrigins.has(origin) ? origin : appUrl ?? origin ?? "*";
  return {
    "Access-Control-Allow-Origin": resolvedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: getCorsHeaders(request.headers.get("origin")) });
}

export async function POST(request: Request) {
  const headers = getCorsHeaders(request.headers.get("origin"));
  const body = (await request.json().catch(() => ({}))) as Payload;
  const email = body.email?.trim().toLowerCase();
  const token = body.token?.trim();
  const newPassword = body.newPassword?.trim();
  const pepper = process.env.HASH_PEPPER_CURRENT;

  if (!email || !token || !newPassword) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400, headers });
  }

  if (!pepper) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers });
  }

  if (
    newPassword.length < minPasswordLength ||
    !passwordPolicy.upper.test(newPassword) ||
    !passwordPolicy.lower.test(newPassword) ||
    !passwordPolicy.number.test(newPassword) ||
    !passwordPolicy.special.test(newPassword)
  ) {
    return NextResponse.json(
      { error: "Password must be 8+ chars with upper, lower, number, and special." },
      { status: 400, headers }
    );
  }

  try {
    const users = (await sql`
      select id
      from users
      where email = ${email}
      limit 1
    `) as { id: string }[];

    const user = users[0];
    if (!user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400, headers });
    }

    const tokenHash = hashToken(token);
    const rows = (await sql`
      select id
      from password_resets
      where user_id = ${user.id}
        and used_at is null
        and expires_at > now()
        and token_hash = ${tokenHash}
      order by created_at desc
      limit 1
    `) as { id: string }[];

    const record = rows[0];
    if (!record) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400, headers });
    }

    const newHash = await bcrypt.hash(pepper + newPassword, 12);
    await sql`update users set password_hash = ${newHash} where id = ${user.id}`;
    await sql`update password_resets set used_at = now() where id = ${record.id}`;

    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500, headers });
  }
}
