import { NextResponse } from "next/server";
import { SignJWT } from "jose";

type Payload = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Payload;
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const token = await new SignJWT({ email, password })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30m")
      .sign(new TextEncoder().encode(secret));

    return NextResponse.json({ token }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to issue token" }, { status: 500 });
  }
}
