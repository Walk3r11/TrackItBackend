import { NextResponse } from "next/server";
import { randomBytes, scryptSync } from "crypto";
import { createAppUser, findAppUserByEmail } from "@/lib/data";

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
  if (!body.email || !body.password || !body.firstName || !body.middleName || !body.lastName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password.trim();
  if (password.length < minPasswordLength) {
    return NextResponse.json({ error: "Password too short" }, { status: 400 });
  }

  const existing = await findAppUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  const user = await createAppUser({
    firstName: body.firstName.trim(),
    middleName: body.middleName.trim(),
    lastName: body.lastName.trim(),
    email,
    passwordHash: hash,
    passwordSalt: salt
  });

  const token = randomBytes(32).toString("hex");

  return NextResponse.json({ token, user }, { status: 201 });
}
