import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

type Payload = {
  email?: string;
  code?: string;
};

const maskEmail = (value: string) => {
  const trimmed = value.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 1) {
    return `***${trimmed.slice(Math.max(atIndex, 0))}`;
  }
  return `${trimmed.slice(0, 2)}...${trimmed.slice(atIndex)}`;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Payload;
  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();

  if (!email || !code) {
    return NextResponse.json({ error: "Missing email or code" }, { status: 400 });
  }

  const masked = maskEmail(email);
  console.log(`[auth] verification confirm attempt for ${masked} (code length ${code.length})`);

  try {
    const users = (await sql`
      select id, email_verified
      from users
      where email = ${email}
      limit 1
    `) as { id: string; email_verified: boolean | null }[];

    const user = users[0];
    if (!user) {
      console.log(`[auth] verification confirm: no user found for ${masked}`);
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    console.log(
      `[auth] verification confirm: user found for ${masked} (verified=${Boolean(
        user.email_verified
      )})`
    );

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
      console.log(`[auth] verification confirm: no active code for ${masked}`);
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const codeHash = hashToken(code);
    if (codeHash !== record.code_hash) {
      console.log(`[auth] verification confirm: invalid code for ${masked}`);
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

    console.log(`[auth] verification confirm: success for ${masked}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`[auth] verification confirm failed for ${masked}:`, error);
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}
