import { NextResponse } from "next/server";
import { lookupUser, getUserSeries } from "@/lib/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const user = await lookupUser(query);
    if (!user) return NextResponse.json({ user: null }, { status: 404 });
    const monthly = await getUserSeries(user.id);
    return NextResponse.json({ user, monthly });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
  }
}
