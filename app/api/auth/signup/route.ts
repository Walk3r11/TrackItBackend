import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAppUser, findAppUserByEmail } from "@/lib/data";
import { jwtVerify } from "jose";
import { hash as argonHash } from "@node-rs/argon2";

type Payload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
};

const minPasswordLength = 8;

export async function POST(request: Request) {
  const body = (await request.json()) as Payload;
  const authHeader = request.headers.get("authorization");
  const secret = process.env.JWT_SECRET || "trackit-secret";
  const pepper = process.env.HASH_PEPPER_CURRENT;
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

  if (!email || !password || !body.firstName || !body.lastName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!pepper) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (password.length < minPasswordLength) {
    return NextResponse.json({ error: "Password too short" }, { status: 400 });
  }

  const existing = await findAppUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const passwordHash = await argonHash(pepper + password);

  const user = await createAppUser({
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    email,
    passwordHash
  });

  const token = randomBytes(32).toString("hex");

  return NextResponse.json({ token, user }, { status: 201 });
}
