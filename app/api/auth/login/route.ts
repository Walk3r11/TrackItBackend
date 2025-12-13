import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAppUserAuth, findAppUserByEmail } from "@/lib/data";
import { jwtVerify } from "jose";
import { verify as argonVerify, hash as argonHash } from "@node-rs/argon2";
import { sql } from "@/lib/db";

type Payload = {
  email?: string;
  password?: string;
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

  const authRow = await getAppUserAuth(email);
  if (!authRow) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
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
    const ok = await argonVerify(authRow.password_hash, p.value + password);
    if (ok) {
      verified = true;
      usedVersion = p.version;
      break;
    }
  }
  if (!verified) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // rehash with current pepper if the previous one was used
  if (usedVersion === "previous") {
    const newHash = await argonHash(currentPepper + password);
    await sql`update users set password_hash = ${newHash} where id = ${authRow.id}`;
  }

  const user = await findAppUserByEmail(email);
  const sessionToken = randomBytes(32).toString("hex");
  return NextResponse.json({ token: sessionToken, user }, { status: 200 });
}
