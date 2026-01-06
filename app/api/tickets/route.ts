import { NextResponse } from "next/server";
import { getUserTickets } from "@/lib/data";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
import { jwtVerify } from "jose";
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
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

async function authenticateSupport(request: Request): Promise<{ authenticated: boolean; error?: string; userId?: string; isSupport?: boolean }> {
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
      return { authenticated: true, isSupport: true };
    } else {
      const userId = await authenticateUser(request);
      if (userId) {
        return { authenticated: true, userId, isSupport: false };
      }
      return { authenticated: false, error: "Not a support user" };
    }
  } catch (error) {
    const userId = await authenticateUser(request);
    if (userId) {
      return { authenticated: true, userId, isSupport: false };
    }
    return { authenticated: false, error: "Invalid token" };
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("userId");
  const status = searchParams.get("status") ?? undefined;
  
  const authenticatedUserId = await authenticateUser(request);
  const auth = await authenticateSupport(request);
  
  const isSupportUser = auth.authenticated && auth.isSupport === true;
  
  if (!auth.authenticated) {
    if (!userIdParam) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }
    if (!authenticatedUserId || authenticatedUserId !== userIdParam) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }
  }

  try {
    if (userIdParam) {
      const tickets = await getUserTickets(userIdParam, status ?? undefined);
      return NextResponse.json({ tickets }, { headers: corsHeaders });
    } else if (isSupportUser) {
      const { getAllTickets } = await import("@/lib/data");
      const tickets = await getAllTickets(status ?? undefined);
      return NextResponse.json({ tickets }, { headers: corsHeaders });
    } else {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: corsHeaders }
      );
    }
  } catch (error) {
    console.error("Error loading tickets:", error);
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
      values (${id}, ${userId}, ${subject}, ${status ?? "pending"}, ${
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

    let tickets: Array<{ id: string; userId: string; subject: string; status: "open" | "pending" | "closed"; priority: "low" | "medium" | "high" | null | undefined; updatedAt: string; createdAt: string }> = [];
    try {
      tickets = await getUserTickets(userId, "all");
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
