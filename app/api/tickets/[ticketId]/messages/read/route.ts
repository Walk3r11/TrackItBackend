import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

async function authenticateUser(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie");
  let token: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) token = cookieMatch[1];
  }

  if (!token) {
    return null;
  }

  try {
    const tokenHash = hashToken(token);
    const rows = (await sql`
      select u.id as user_id
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${tokenHash}
        and s.revoked_at is null
        and s.expires_at > now()
      limit 1
    `) as Array<{ user_id: string }>;

    return rows[0]?.user_id ?? null;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: { ticketId: string } }
) {
  const corsHeaders = getCorsHeaders(request);
  const ticketId = params.ticketId;
  if (!ticketId) {
    return NextResponse.json(
      { error: "Missing ticketId" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const supportUserId = searchParams.get("supportUserId");
  const reader = searchParams.get("reader");

  const userId = await authenticateUser(request);
  const isSupportAccess = !!supportUserId && reader === "support";

  if (!userId && !isSupportAccess) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const ticketRows = (await sql`
      select user_id from tickets where id = ${ticketId} limit 1
    `) as Array<{ user_id: string }>;

    if (!ticketRows[0]) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    if (!isSupportAccess && ticketRows[0].user_id !== userId) {
      return NextResponse.json(
        { error: "Ticket not found or access denied" },
        { status: 403, headers: corsHeaders }
      );
    }

    if (isSupportAccess && ticketRows[0].user_id !== supportUserId) {
      return NextResponse.json(
        { error: "Ticket user mismatch" },
        { status: 403, headers: corsHeaders }
      );
    }

    if (reader === "support") {
      await sql`
        update ticket_messages
        set read_by_support_at = now()
        where ticket_id = ${ticketId}
          and sender_type = 'user'
          and read_by_support_at is null
      `;
    } else {
      await sql`
        update ticket_messages
        set read_by_user_at = now()
        where ticket_id = ${ticketId}
          and sender_type = 'support'
          and read_by_user_at is null
      `;
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update read status" },
      { status: 500, headers: corsHeaders }
    );
  }
}
