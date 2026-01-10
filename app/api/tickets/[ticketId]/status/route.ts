import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { jwtVerify } from "jose";

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
    "Access-Control-Allow-Methods": "PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
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

async function authenticateSupport(request: Request): Promise<{ authenticated: boolean; isSupport: boolean }> {
  const cookieHeader = request.headers.get("cookie");
  const authHeader = request.headers.get("authorization");
  
  let token: string | null = null;
  
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) token = cookieMatch[1];
  }

  if (!token) {
    return { authenticated: false, isSupport: false };
  }

  try {
    const JWT_SECRET = new TextEncoder().encode(
      process.env.JWT_SECRET || "trackit-secret"
    );
    
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.role === "support") {
      return { authenticated: true, isSupport: true };
    }
    return { authenticated: false, isSupport: false };
  } catch {
    return { authenticated: false, isSupport: false };
  }
}

export async function PATCH(
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

  try {
    const body = await request.json();
    const { status } = body;

    if (!status || !["open", "pending", "closed"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'open', 'pending', or 'closed'" },
        { status: 400, headers: corsHeaders }
      );
    }

    const userId = await authenticateUser(request);
    const supportAuth = await authenticateSupport(request);
    const isSupport = supportAuth.authenticated && supportAuth.isSupport;

    if (!userId && !isSupport) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
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

    const ticket = ticketRows[0];

    if (!isSupport) {
      if (userId !== ticket.user_id) {
        return NextResponse.json(
          { error: "Ticket not found or access denied" },
          { status: 403, headers: corsHeaders }
        );
      }
      
      if (status !== "closed") {
        return NextResponse.json(
          { error: "Users can only close tickets. Only support can open or set tickets to pending." },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    await sql`
      update tickets 
      set status = ${status},
          updated_at = now()
      where id = ${ticketId}
    `;

    const statusData = { type: "status", status };
    
    try {
      if ((global as any).wsBroadcast) {
        (global as any).wsBroadcast.toTicket(ticketId, statusData);
      }
    } catch (error) {
    }

    return NextResponse.json(
      { success: true, status },
      { headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update ticket status" },
      { status: 500, headers: corsHeaders }
    );
  }
}

