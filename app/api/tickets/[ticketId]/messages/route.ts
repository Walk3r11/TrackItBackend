import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
import { getSessionUserId, verifySupportJwt } from "@/lib/auth";
import { normalizeTicketId } from "@/lib/ticket-id";

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

export async function GET(
  request: Request,
  { params }: { params: { ticketId: string } }
) {
  const corsHeaders = getCorsHeaders(request);
  const ticketId = normalizeTicketId(params.ticketId);
  if (!ticketId) {
    return NextResponse.json(
      { error: "Missing ticketId" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const supportUserId = searchParams.get("supportUserId");

  const userId = await getSessionUserId(request);
  const isSupportAccess = await verifySupportJwt(request);

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

    if (isSupportAccess && supportUserId && ticketRows[0].user_id !== supportUserId) {
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
        created_at,
        read_by_user_at,
        read_by_support_at
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
      read_by_user_at: string | null;
      read_by_support_at: string | null;
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
  const ticketId = normalizeTicketId(params.ticketId);
  if (!ticketId) {
    return NextResponse.json(
      { error: "Missing ticketId" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const supportUserId = searchParams.get("supportUserId");

  const userId = await getSessionUserId(request);

  try {
    const body = await request.json();
    const { content, senderType } = body;

    const isSupportAccess = (await verifySupportJwt(request)) && senderType === "support";

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
      select user_id, status, subject from tickets where id = ${ticketId} limit 1
    `) as Array<{ user_id: string; status: string; subject: string | null }>;

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

    if (isSupportAccess && supportUserId && ticketRows[0].user_id !== supportUserId) {
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
    const readByUserAt = sender_type === "user" ? new Date() : null;
    const readBySupportAt = sender_type === "support" ? new Date() : null;
    await sql`
      insert into ticket_messages (
        id,
        ticket_id,
        user_id,
        sender_type,
        content,
        read_by_user_at,
        read_by_support_at
      )
      values (
        ${messageId},
        ${ticketId},
        ${messageUserId},
        ${sender_type},
        ${content.trim()},
        ${readByUserAt},
        ${readBySupportAt}
      )
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
        created_at,
        read_by_user_at,
        read_by_support_at
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
      read_by_user_at: string | null;
      read_by_support_at: string | null;
    }>;

    const messageData = { type: "message", message: newMessage[0] };
    
    try {
      if ((global as any).wsBroadcast) {
        (global as any).wsBroadcast.toTicket(ticketId, messageData);
        const ownerUserId = ticketRows[0].user_id;
        if (newMessage[0]?.sender_type === "support" && ownerUserId) {
          (global as any).wsBroadcast.toUser(ownerUserId, messageData);
        }
      }
    } catch (error) {
    }

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
