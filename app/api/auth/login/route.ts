import { NextResponse } from "next/server";
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import { getAppUserAuth, findAppUserByEmail } from "@/lib/data";

type Payload = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Payload;
  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  const hashSalt = process.env.HASH_SALT || process.env.PASSWORD_SALT;
  if (!hashSalt) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const email = body.email.trim().toLowerCase();
  const password = body.password.trim();

  const authRow = await getAppUserAuth(email);
  if (!authRow) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const derived = createHash("sha512").update(password + hashSalt).digest();
  const stored = Buffer.from(authRow.password_hash, "hex");
  const match = stored.length === derived.length && timingSafeEqual(stored, derived);
  if (!match) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const user = await findAppUserByEmail(email);
  const token = randomBytes(32).toString("hex");
  return NextResponse.json({ token, user }, { status: 200 });
}
