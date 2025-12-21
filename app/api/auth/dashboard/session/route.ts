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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

export function OPTIONS(request: Request) {
  return NextResponse.json({}, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const authHeader = request.headers.get("authorization");
    
    let token: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (cookieHeader) {
      const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
      if (cookieMatch) token = cookieMatch[1];
    }

    const corsHeaders = getCorsHeaders(request);

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401, headers: corsHeaders });
    }

    try {
      const JWT_SECRET = new TextEncoder().encode(
        process.env.JWT_SECRET || "trackit-secret"
      );
      
      const { payload } = await jwtVerify(token, JWT_SECRET);
      
      if (payload.role === "support" && payload.email) {
        return NextResponse.json({ 
          authenticated: true, 
          user: { email: payload.email },
          token 
        }, { status: 200, headers: corsHeaders });
      }
    } catch {
    }

    return NextResponse.json({ authenticated: false }, { status: 401, headers: corsHeaders });
  } catch (error) {
    const corsHeaders = getCorsHeaders(request);
    return NextResponse.json({ authenticated: false }, { status: 401, headers: corsHeaders });
  }
}

