import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { generateVerificationCode, hashToken } from "@/lib/tokens";

type Payload = {
  email?: string;
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

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const masked = maskEmail(email);
  console.log(`[auth] verification request received for ${masked}`);

  try {
    const users = (await sql`
      select id, email_verified
      from users
      where email = ${email}
      limit 1
    `) as { id: string; email_verified: boolean | null }[];

    const user = users[0];
    if (!user) {
      console.log(`[auth] verification request: no user found for ${masked}`);
      return NextResponse.json({ ok: true });
    }

    console.log(
      `[auth] issuing verification code for ${masked} (verified=${Boolean(
        user.email_verified
      )})`
    );

    await sql`
      update email_verifications
      set used_at = now()
      where user_id = ${user.id}
        and used_at is null
    `;

    const code = generateVerificationCode();
    const codeHash = hashToken(code);

    await sql`
      insert into email_verifications (user_id, code_hash, expires_at)
      values (${user.id}, ${codeHash}, now() + interval '10 minutes')
    `;

    await sendEmail({
      to: email,
      subject: "Your Trackit verification code",
      html: `<p>Your verification code is:</p><p style="font-size:20px;font-weight:600;letter-spacing:2px;">${code}</p><p>This code expires in 10 minutes.</p>`,
      text: `Your verification code is ${code}. It expires in 10 minutes.`
    });

    console.log(`[auth] verification email sent for ${masked}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`[auth] verification request failed for ${masked}:`, error);
    return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
  }
}
