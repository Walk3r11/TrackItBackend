import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { randomUUID } from "crypto";

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "https://www.trackitco.com",
    "https://trackitco.com",
    "http://localhost:3000",
  ];
  
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  
  return headers;
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

async function authenticateUser(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
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

export async function GET(
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

  const userId = await authenticateUser(request);
  const isSupportAccess = !!supportUserId;

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

    const messages = (await sql`
      select 
        id,
        ticket_id,
        user_id,
        sender_type,
        content,
        created_at
      from ticket_messages
      where ticket_id = ${ticketId}
      order by created_at asc
    `) as Array<{
      id: string;
      ticket_id: string;
      user_id: string | null;
      sender_type: "user" | "support";
      content: string;
      created_at: string;
    }>;

    return NextResponse.json({ messages }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500, headers: corsHeaders }
    );
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

  const userId = await authenticateUser(request);

  try {
    const body = await request.json();
    const { content, senderType } = body;

    const isSupportAccess = !!supportUserId && senderType === "support";

    if (!userId && !isSupportAccess) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    if (
      !content ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const ticketRows = (await sql`
      select user_id, status from tickets where id = ${ticketId} limit 1
    `) as Array<{ user_id: string; status: string }>;

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

    if (ticketRows[0].status === "closed") {
      return NextResponse.json(
        { error: "Cannot send message. Ticket is closed. Only support can reopen it." },
        { status: 403, headers: corsHeaders }
      );
    }
    
    if (!isSupportAccess && ticketRows[0].status !== "open") {
      return NextResponse.json(
        { error: `Cannot send message. Ticket is ${ticketRows[0].status}. Only open tickets allow messaging.` },
        { status: 403, headers: corsHeaders }
      );
    }

    const sender_type = senderType === "support" ? "support" : "user";
    const messageUserId = isSupportAccess ? null : userId;

    const messageId = randomUUID();
    await sql`
      insert into ticket_messages (id, ticket_id, user_id, sender_type, content)
      values (${messageId}, ${ticketId}, ${messageUserId}, ${sender_type}, ${content.trim()})
    `;

    await sql`
      update tickets 
      set updated_at = now(),
          status = case 
            when status = 'pending' and ${sender_type} = 'support' then 'open'
            else status
          end
      where id = ${ticketId}
    `;

    const newMessage = (await sql`
      select 
        id,
        ticket_id,
        user_id,
        sender_type,
        content,
        created_at
      from ticket_messages
      where id = ${messageId}
      limit 1
    `) as Array<{
      id: string;
      ticket_id: string;
      user_id: string | null;
      sender_type: "user" | "support";
      content: string;
      created_at: string;
    }>;

    return NextResponse.json(
      { message: newMessage[0] },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500, headers: corsHeaders }
    );
  }
}
