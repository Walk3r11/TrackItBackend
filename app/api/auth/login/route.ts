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

const minPasswordLength = 8;
const passwordPolicy = {
  upper: /[A-Z]/,
  lower: /[a-z]/,
  number: /[0-9]/,
  special: /[^A-Za-z0-9]/
};

export async function POST(request: Request) {
  const body = (await request.json()) as Payload;
  const authHeader = request.headers.get("authorization");
  const secret = process.env.JWT_SECRET || "trackit-secret";
  const currentPepper = process.env.HASH_PEPPER_CURRENT;
  const previousPepper = process.env.HASH_PEPPER_PREVIOUS;

  let email = body.email?.trim().toLowerCase();
  let password = body.password?.trim();

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const { payload } = await jwtVerify(bearerToken, new TextEncoder().encode(secret));
      if (typeof payload.email === "string") email = payload.email.toLowerCase();
      if (typeof payload.password === "string") password = payload.password;
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }
  } else {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
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
      { status: 400 }
    );
  }

  const authRow = await getAppUserAuth(email);
  if (!authRow) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (authRow.email_verified === false) {
    return NextResponse.json({ error: "Email not verified" }, { status: 403 });
  }

  if (!currentPepper) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
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
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
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
    values (${authRow.id}, ${tokenHash}, now() + interval '2 months')
  `;
  return NextResponse.json({ token: sessionToken, user }, { status: 200 });
}
