import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { generateResetToken, getAppBaseUrl, hashToken } from "@/lib/tokens";

type Payload = {
  email?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Payload;
  const email = body.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
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
      return NextResponse.json({ ok: true });
    }

    const token = generateResetToken();
    const tokenHash = hashToken(token);

    await sql`
      insert into password_resets (user_id, token_hash, expires_at)
      values (${user.id}, ${tokenHash}, now() + interval '1 hour')
    `;

    const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(
      email
    )}`;

    await sendEmail({
      to: email,
      subject: "Reset your Trackit password",
      html: `<p>Click to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
      text: `Reset your password: ${resetUrl} (expires in 1 hour)`
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 });
  }
}
