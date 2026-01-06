import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "https://www.trackitco.com",
    "https://trackitco.com",
    "http://localhost:3000",
  ];

  const allowOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

async function authenticateUser(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie");

  let token: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token && cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) {
      token = cookieMatch[1];
    }
  }

  if (!token) {
    return null;
  }

  try {
    const { jwtVerify } = await import("jose");
    const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.role === "support") {
        return null;
      }
    } catch { }

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

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  try {
    const userId = await authenticateUser(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const url = new URL(request.url);
    const queryUserId = url.searchParams.get("userId");

    if (queryUserId && queryUserId !== userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: corsHeaders }
      );
    }

    const chatId = url.searchParams.get("chatId");

    if (chatId) {
      const rows = (await sql`
        select messages, updated_at, chat_id
        from chat_history
        where user_id = ${userId} and chat_id = ${chatId}
        limit 1
      `) as Array<{
        messages: any;
        updated_at: Date;
        chat_id: string;
      }>;

      if (rows.length === 0) {
        return NextResponse.json(
          { messages: [] },
          { status: 200, headers: corsHeaders }
        );
      }

      const messages = Array.isArray(rows[0].messages) ? rows[0].messages : [];

      return NextResponse.json(
        { messages, chatId: rows[0].chat_id },
        { status: 200, headers: corsHeaders }
      );
    }

    const rows = (await sql`
      select messages, updated_at, chat_id
      from chat_history
      where user_id = ${userId}
      order by updated_at desc
      limit 1
    `) as Array<{
      messages: any;
      updated_at: Date;
      chat_id: string;
    }>;

    if (rows.length === 0) {
      return NextResponse.json(
        { messages: [] },
        { status: 200, headers: corsHeaders }
      );
    }

    const messages = Array.isArray(rows[0].messages) ? rows[0].messages : [];

    return NextResponse.json(
      { messages, chatId: rows[0].chat_id },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Chat History API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  try {
    const userId = await authenticateUser(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { messages, chatId } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    await sql`
      insert into chat_history (user_id, chat_id, messages, updated_at)
      values (${userId}, ${chatId}, ${JSON.stringify(messages)}, now())
      on conflict (user_id, chat_id) do update
      set messages = ${JSON.stringify(messages)},
          updated_at = now()
    `;

    return NextResponse.json(
      { success: true },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Chat History API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  try {
    const userId = await authenticateUser(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const url = new URL(request.url);
    const chatId = url.searchParams.get("chatId");

    if (chatId) {
      await sql`
        delete from chat_history
        where user_id = ${userId} and chat_id = ${chatId}
      `;
    } else {
      await sql`
        delete from chat_history
        where user_id = ${userId}
      `;
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Chat History API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
