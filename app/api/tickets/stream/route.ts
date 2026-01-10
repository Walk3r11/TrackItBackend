import { NextResponse } from "next/server";
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

export function OPTIONS(request: Request) {
  return NextResponse.json({}, { status: 204, headers: getCorsHeaders(request) });
}

async function authenticateSupport(request: Request): Promise<{ userId: string | null; error?: string }> {
  const { searchParams } = new URL(request.url);
  const cookieHeader = request.headers.get("cookie");
  const authHeader = request.headers.get("authorization");
  
  let token: string | null = null;
  
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) token = cookieMatch[1];
  }
  
  const tokenParam = searchParams.get("token");
  if (!token && tokenParam) {
    token = decodeURIComponent(tokenParam);
  }
  
  if (!token) {
    return { userId: null, error: "No token provided" };
  }

  try {
    const JWT_SECRET = new TextEncoder().encode(
      process.env.JWT_SECRET || "trackit-secret"
    );
    
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.role === "support") {
      const userId = searchParams.get("userId");
      return { userId: userId || null };
    } else {
      return { userId: null, error: "Not a support user" };
    }
  } catch (error) {
    return { userId: null, error: "Invalid token" };
  }
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing userId" }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const auth = await authenticateSupport(request);
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: auth.error || "Unauthorized" }), { 
      status: 401, 
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  if (auth.userId !== userId) {
    return new Response(JSON.stringify({ error: "UserId mismatch" }), { 
      status: 403, 
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return NextResponse.json(
    { 
      message: "This endpoint is deprecated. Please use WebSocket at /api/ws instead.",
      websocket: "/api/ws"
    },
    { 
      status: 410,
      headers: corsHeaders 
    }
  );
}
