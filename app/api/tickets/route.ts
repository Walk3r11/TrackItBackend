import { NextResponse } from "next/server";
import { getUserTickets } from "@/lib/data";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

async function authenticateSupport(request: Request): Promise<{ authenticated: boolean; error?: string }> {
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
    return { authenticated: false, error: "No token provided" };
  }

  try {
    const JWT_SECRET = new TextEncoder().encode(
      process.env.JWT_SECRET || "trackit-secret"
    );
    
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.role === "support") {
      return { authenticated: true };
    } else {
      return { authenticated: false, error: "Not a support user" };
    }
  } catch (error) {
    return { authenticated: false, error: "Invalid token" };
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  
  const auth = await authenticateSupport(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status") ?? undefined;
  if (!userId)
    return NextResponse.json(
      { error: "Missing userId" },
      { status: 400, headers: corsHeaders }
    );

  try {
    const tickets = await getUserTickets(userId, status ?? undefined);
    return NextResponse.json({ tickets }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { tickets: [], error: "Failed to load tickets" },
      { status: 200, headers: corsHeaders }
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
  try {
    const id = randomUUID();
    await sql`
      insert into tickets (id, user_id, subject, status, priority)
      values (${id}, ${userId}, ${subject}, ${status ?? "open"}, ${
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
        insert into ticket_messages (id, ticket_id, user_id, sender_type, content)
        values (${messageId}, ${id}, ${userId}, 'user', ${initialMessage.trim()})
      `;
    }

    const tickets = await getUserTickets(userId, "all");
    return NextResponse.json(
      { ticketId: id, tickets },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create ticket" },
      { status: 500, headers: corsHeaders }
    );
  }
}
