import { NextResponse } from "next/server";
import { lookupSupportUser, getUserSeries } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const result = await lookupSupportUser(query);
    if (!result) return NextResponse.json({ user: null, source: null }, { status: 200 });
    const monthly = result.source === "users" ? await getUserSeries(result.user.id) : [];
    return NextResponse.json(
      { user: result.user, monthly, source: result.source },
      { status: 200, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
}
