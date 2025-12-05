import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { createAppUser, findAppUserByEmail } from "@/lib/data";
import { jwtVerify } from "jose";

type Payload = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  password?: string;
};

const minPasswordLength = 8;

export async function POST(request: Request) {
  const body = (await request.json()) as Payload;
  const authHeader = request.headers.get("authorization");
  const secret = process.env.JWT_SECRET || "trackit-secret";
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }
  const bearerToken = authHeader.slice(7).trim();

  let email = body.email?.trim().toLowerCase();
  let password = body.password?.trim();
  try {
    const { payload } = await jwtVerify(bearerToken, new TextEncoder().encode(secret));
    if (typeof payload.email === "string") email = payload.email.toLowerCase();
    if (typeof payload.password === "string") password = payload.password;
  } catch {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  if (!email || !password || !body.firstName || !body.middleName || !body.lastName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const hashSalt = process.env.HASH_SALT || process.env.PASSWORD_SALT;
  if (!hashSalt) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (password.length < minPasswordLength) {
    return NextResponse.json({ error: "Password too short" }, { status: 400 });
  }

  const existing = await findAppUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const passwordHash = createHash("sha512").update(password + hashSalt).digest("hex");

  const user = await createAppUser({
    firstName: body.firstName.trim(),
    middleName: body.middleName.trim(),
    lastName: body.lastName.trim(),
    email,
    passwordHash,
    passwordSalt: "" // do not store reusable salt
  });

  const token = randomBytes(32).toString("hex");

  return NextResponse.json({ token, user }, { status: 201 });
}
