import { NextResponse } from "next/server";
import { lookupSupportUser, getUserSeries } from "@/lib/data";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
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
