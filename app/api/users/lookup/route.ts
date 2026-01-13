import { NextResponse } from "next/server";
import { lookupSupportUser, getUserSeries } from "@/lib/data";

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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400, headers: corsHeaders });

  try {
    const result = await lookupSupportUser(query);
    if (!result) return NextResponse.json({ user: null, source: null }, { status: 200, headers: corsHeaders });
    const monthly = result.source === "users" ? await getUserSeries(result.user.id) : [];
    return NextResponse.json(
      { user: result.user, monthly, source: result.source },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500, headers: corsHeaders });
  }
}
