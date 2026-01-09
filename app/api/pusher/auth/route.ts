import { NextResponse } from "next/server";
import { getPusher } from "@/lib/pusher";
import { hashToken } from "@/lib/tokens";
import { sql } from "@/lib/db";
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { 
    status: 204, 
    headers: getCorsHeaders(request) 
  });
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
    const JWT_SECRET = new TextEncoder().encode(
      process.env.JWT_SECRET || "trackit-secret"
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

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  
  try {
    const formData = await request.formData();
    const socket_id = formData.get("socket_id") as string;
    const channel_name = formData.get("channel_name") as string;

    if (!socket_id || !channel_name) {
      return NextResponse.json(
        { error: "Missing socket_id or channel_name" },
        { status: 400, headers: corsHeaders }
      );
    }

    const auth = await authenticateUser(request);
    if (!auth.userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    if (channel_name.startsWith("private-user-")) {
      const channelUserId = channel_name.replace("private-user-", "");
      if (channelUserId !== auth.userId && !auth.isSupport) {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403, headers: corsHeaders }
        );
      }
    } else if (channel_name.startsWith("private-ticket-")) {
      const ticketId = channel_name.replace("private-ticket-", "");
      const ticketRows = (await sql`
        select user_id from tickets where id = ${ticketId} limit 1
      `) as Array<{ user_id: string }>;

      if (ticketRows.length === 0) {
        return NextResponse.json(
          { error: "Ticket not found" },
          { status: 404, headers: corsHeaders }
        );
      }

      if (auth.isSupport) {
        const { searchParams } = new URL(request.url);
        const supportUserId = searchParams.get("supportUserId");
        if (ticketRows[0].user_id !== supportUserId) {
          return NextResponse.json(
            { error: "Forbidden" },
            { status: 403, headers: corsHeaders }
          );
        }
      } else {
        if (ticketRows[0].user_id !== auth.userId) {
          return NextResponse.json(
            { error: "Forbidden" },
            { status: 403, headers: corsHeaders }
          );
        }
      }
    } else {
      return NextResponse.json(
        { error: "Invalid channel" },
        { status: 400, headers: corsHeaders }
      );
    }

    try {
      const pusher = getPusher();
      const authResponse = pusher.authorizeChannel(socket_id, channel_name);
      
      if (!authResponse || typeof authResponse !== 'object') {
        throw new Error("Invalid auth response from Pusher");
      }
      
      return NextResponse.json(authResponse, { headers: corsHeaders });
    } catch (pusherError) {
      console.error("[Pusher Auth] Pusher error:", pusherError);
      console.error("[Pusher Auth] Error details:", {
        message: pusherError instanceof Error ? pusherError.message : "Unknown",
        stack: pusherError instanceof Error ? pusherError.stack : undefined,
        socket_id,
        channel_name,
      });
      const errorMessage = pusherError instanceof Error ? pusherError.message : "Pusher authorization failed";
      return NextResponse.json(
        { error: errorMessage, details: pusherError instanceof Error ? pusherError.stack : undefined },
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (error) {
    console.error("[Pusher Auth] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
}
