import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { jwtVerify } from "jose";

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

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
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
        }, { status: 200 });
      }
    } catch {
    }

    return NextResponse.json({ authenticated: false }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

