import { NextResponse } from "next/server";
import { getUserTickets } from "@/lib/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status") ?? undefined;
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  try {
    const tickets = await getUserTickets(userId, status ?? undefined);
    return NextResponse.json({ tickets });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
  }
}
