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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

export function OPTIONS(request: Request) {
  return NextResponse.json({}, { status: 204, headers: getCorsHeaders(request) });
}

async function authenticateUser(request: Request): Promise<{ userId: string | null; isSupport: boolean }> {
  const cookieHeader = request.headers.get("cookie");
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const supportUserId = searchParams.get("supportUserId");
  
  let token: string | null = null;
  
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) token = cookieMatch[1];
  }
  
  const tokenParam = searchParams.get("token");
  if (!token && tokenParam) {
    token = tokenParam;
  }
  
  if (!token) {
    return { userId: null, isSupport: false };
  }

  try {
    const { jwtVerify } = await import("jose");
    const JWT_SECRET = new TextEncoder().encode(
      process.env.JWT_SECRET
    );
    
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.role === "support" && supportUserId) {
        return { userId: supportUserId, isSupport: true };
      }
    } catch {
    }
    
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

    return { userId: rows[0]?.user_id ?? null, isSupport: false };
  } catch {
    return { userId: null, isSupport: false };
  }
}

export async function GET(
  request: Request,
  { params }: { params: { ticketId: string } }
) {
  const corsHeaders = getCorsHeaders(request);
  const ticketId = params.ticketId;
  if (!ticketId) {
    return new Response("Missing ticketId", { status: 400, headers: corsHeaders });
  }

  const { searchParams } = new URL(request.url);
  const supportUserId = searchParams.get("supportUserId");

  const auth = await authenticateUser(request);
  if (!auth.userId) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const ticketRows = (await sql`
    select user_id from tickets where id = ${ticketId} limit 1
  `) as Array<{ user_id: string }>;

  if (!ticketRows[0]) {
    return new Response("Ticket not found", { status: 404, headers: corsHeaders });
  }

  if (auth.isSupport) {
    if (ticketRows[0].user_id !== supportUserId) {
      return new Response("Ticket user mismatch", { status: 403, headers: corsHeaders });
    }
  } else {
    if (ticketRows[0].user_id !== auth.userId) {
      return new Response("Ticket not found or access denied", { status: 403, headers: corsHeaders });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastMessageId: string | null = null;
      let isActive = true;
      let lastPollTime = Date.now();

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );

      const pollForMessages = async (immediate = false) => {
        if (!isActive) return;

        const now = Date.now();
        if (!immediate && now - lastPollTime < 50) {
          return;
        }
        lastPollTime = now;

        try {
          const query = lastMessageId
            ? sql`
                select 
                  id,
                  ticket_id,
                  user_id,
                  sender_type,
                  content,
                  created_at
                from ticket_messages
                where ticket_id = ${ticketId}
                  and id > ${lastMessageId}
                order by created_at asc
              `
            : sql`
                select 
                  id,
                  ticket_id,
                  user_id,
                  sender_type,
                  content,
                  created_at
                from ticket_messages
                where ticket_id = ${ticketId}
                order by created_at desc
                limit 1
              `;

          const messages = (await query) as Array<{
            id: string;
            ticket_id: string;
            user_id: string | null;
            sender_type: "user" | "support";
            content: string;
            created_at: string;
          }>;

          if (messages.length > 0) {
            const newMessages = lastMessageId ? messages : messages.reverse();

            for (const message of newMessages) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "message", message })}\n\n`
                )
              );
              lastMessageId = message.id;
            }
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Polling failed",
              })}\n\n`
            )
          );
        }
      };

      await pollForMessages(true);

      const pollInterval = setInterval(() => pollForMessages(false), 100);

      request.signal.addEventListener("abort", () => {
        isActive = false;
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...getCorsHeaders(request),
    },
  });
}
