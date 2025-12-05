import { NextResponse } from "next/server";
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import { getAppUserAuth, findAppUserByEmail } from "@/lib/data";
import { jwtVerify } from "jose";

type Payload = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Payload;
  const authHeader = request.headers.get("authorization");
  const secret = process.env.JWT_SECRET || "trackit-secret";
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }
  const bearerToken = authHeader.slice(7).trim();

  let tokenEmail = body.email?.trim().toLowerCase();
  let tokenPassword = body.password?.trim();
  try {
    const { payload } = await jwtVerify(bearerToken, new TextEncoder().encode(secret));
    if (typeof payload.email === "string") tokenEmail = payload.email.toLowerCase();
    if (typeof payload.password === "string") tokenPassword = payload.password;
  } catch {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  if (!tokenEmail || !tokenPassword) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  const email = tokenEmail;
  const password = tokenPassword;

  const authRow = await getAppUserAuth(email);
  if (!authRow) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const salt = process.env.HASH_SALT || process.env.PASSWORD_SALT;
  if (!salt) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const derived = createHash("sha512").update(password + salt).digest();
  const stored = Buffer.from(authRow.password_hash, "hex");
  const match = stored.length === derived.length && timingSafeEqual(stored, derived);
  if (!match) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const user = await findAppUserByEmail(email);
  const sessionToken = randomBytes(32).toString("hex");
  return NextResponse.json({ token: sessionToken, user }, { status: 200 });
}
