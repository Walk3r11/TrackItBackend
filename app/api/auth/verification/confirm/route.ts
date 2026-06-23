import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

type Payload = {
  email?: string;
  code?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Payload;
  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();

  if (!email || !code) {
    return NextResponse.json({ error: "Missing email or code" }, { status: 400 });
  }

  try {
    const users = (await sql`
      select id, email_verified
      from users
      where email = ${email}
      limit 1
    `) as { id: string; email_verified: boolean | null }[];

    const user = users[0];
    if (!user) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const rows = (await sql`
      select id, code_hash, expires_at
      from email_verifications
      where user_id = ${user.id}
        and used_at is null
        and expires_at > now()
      order by created_at desc
      limit 1
    `) as { id: string; code_hash: string; expires_at: string }[];

    const record = rows[0];
    if (!record) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const codeHash = hashToken(code);
    if (codeHash !== record.code_hash) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    await sql`
      update email_verifications
      set used_at = now()
      where id = ${record.id}
    `;
    await sql`
      update users
      set email_verified = true
      where id = ${user.id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}
