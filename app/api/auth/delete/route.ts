import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

async function removeUser(userId: string) {
  await sql`delete from users where id = ${userId}`;
}

async function handle(request: Request) {
  try {
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let requestedUserId: string | null = null;

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      requestedUserId = (body as { userId?: string })?.userId ?? null;
    } else {
      const { searchParams } = new URL(request.url);
      requestedUserId = searchParams.get("userId");
    }

    if (requestedUserId && requestedUserId !== sessionUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await removeUser(sessionUserId);
    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}

export const dynamic = "force-dynamic";
