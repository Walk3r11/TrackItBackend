import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body?.userId as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    await sql`delete from users where id = ${userId}`;
    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
