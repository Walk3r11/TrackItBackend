import { NextResponse } from "next/server";
import { getUserTickets } from "@/lib/data";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
import { getSessionUserId, requireSessionForUserId, verifySupportJwt } from "@/lib/auth";

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("userId");
  const status = searchParams.get("status") ?? undefined;
  
  const sessionUserId = await getSessionUserId(request);
  const isSupportUser = await verifySupportJwt(request);

  if (isSupportUser) {
    try {
      if (userIdParam) {
        const tickets = await getUserTickets(userIdParam, status ?? undefined);
        return NextResponse.json({ tickets }, { headers: corsHeaders });
      }
      const { getAllTickets } = await import("@/lib/data");
      const tickets = await getAllTickets(status ?? undefined);
      return NextResponse.json({ tickets }, { headers: corsHeaders });
    } catch (error) {
      return NextResponse.json(
        { tickets: [], error: error instanceof Error ? error.message : "Failed to load tickets" },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  if (!sessionUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const targetUserId = userIdParam ?? sessionUserId;
  if (targetUserId !== sessionUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  try {
    const tickets = await getUserTickets(targetUserId, status ?? undefined);
    return NextResponse.json({ tickets }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { tickets: [], error: error instanceof Error ? error.message : "Failed to load tickets" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const body = await request.json();
  const { userId, subject, status, priority, initialMessage } = body;
  if (!userId || !subject) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400, headers: corsHeaders }
    );
  }
  const auth = await requireSessionForUserId(request, userId, corsHeaders);
  if (auth instanceof NextResponse) return auth;
  const sessionUserId = auth.userId;
  try {
    const id = randomUUID();
    await sql`
      insert into tickets (id, user_id, subject, status, priority)
      values (${id}, ${sessionUserId}, ${subject}, ${status ?? "pending"}, ${
      priority ?? null
    })
    `;

    if (
      initialMessage &&
      typeof initialMessage === "string" &&
      initialMessage.trim().length > 0
    ) {
      const messageId = randomUUID();
      await sql`
        insert into ticket_messages (
          id,
          ticket_id,
          user_id,
          sender_type,
          content,
          read_by_user_at
        )
        values (
          ${messageId},
          ${id},
          ${sessionUserId},
          'user',
          ${initialMessage.trim()},
          ${new Date()}
        )
      `;
    }

    let tickets: Array<{ id: string; userId: string; subject: string; status: "open" | "pending" | "closed"; priority: "low" | "medium" | "high" | null | undefined; updatedAt: string; createdAt: string }> = [];
    try {
      tickets = await getUserTickets(sessionUserId, "all");
    } catch (ticketsError) {
      console.error("Error fetching tickets after creation (non-fatal):", ticketsError);
    }
    
    return NextResponse.json(
      { ticketId: id, tickets },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error creating ticket:", error);
    return NextResponse.json(
      { error: "Failed to create ticket" },
      { status: 500, headers: corsHeaders }
    );
  }
}
