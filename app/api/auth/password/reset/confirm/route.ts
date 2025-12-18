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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Payload;
  const email = body.email?.trim().toLowerCase();
  const token = body.token?.trim();
  const newPassword = body.newPassword?.trim();
  const pepper = process.env.HASH_PEPPER_CURRENT;

  if (!email || !token || !newPassword) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!pepper) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (newPassword.length < minPasswordLength) {
    return NextResponse.json({ error: "Password too short" }, { status: 400 });
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
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
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
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const newHash = await bcrypt.hash(pepper + newPassword, 12);
    await sql`update users set password_hash = ${newHash} where id = ${user.id}`;
    await sql`update password_resets set used_at = now() where id = ${record.id}`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
