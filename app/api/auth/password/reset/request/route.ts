import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { generateResetToken, getAppBaseUrl, hashToken } from "@/lib/tokens";

type Payload = {
  email?: string;
};

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "https://www.trackitco.com",
    "https://trackitco.com",
    "http://localhost:3000",
  ];
  
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const body = (await request.json().catch(() => ({}))) as Payload;
  const email = body.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400, headers: corsHeaders });
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
      return NextResponse.json({ ok: true }, { headers: corsHeaders });
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

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send reset email" }, { status: 500, headers: corsHeaders });
  }
}
