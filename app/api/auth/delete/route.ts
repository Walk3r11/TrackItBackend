import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

async function removeUser(userId: string) {
  await sql`delete from users where id = ${userId}`;
}

async function handle(request: Request) {
  try {
    let userId: string | null = null;

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      userId = (body as any)?.userId ?? null;
    } else {
      const { searchParams } = new URL(request.url);
      userId = searchParams.get("userId");
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    await removeUser(userId);
    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
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
