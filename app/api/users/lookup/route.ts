import { NextResponse } from "next/server";
import { lookupSupportUser, getUserSeries } from "@/lib/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const result = await lookupSupportUser(query);
    if (!result) return NextResponse.json({ user: null }, { status: 404 });
    const monthly = result.source === "users" ? await getUserSeries(result.user.id) : [];
    return NextResponse.json({ user: result.user, monthly });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
  }
}
