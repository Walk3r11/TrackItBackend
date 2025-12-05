import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

async function getCards(userId: string) {
  const rows = await sql`
    select id, nickname, brand, holder, last4, full_number, expiry, card_limit, balance
    from cards
    where user_id = ${userId}
    order by created_at desc
  `;
  return rows;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  try {
    const cards = await getCards(userId);
    return NextResponse.json({ cards });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load cards" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { userId, nickname, brand, holder, last4, fullNumber, expiry, limit, balance } = body;
  if (!userId || !last4 || !holder) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  try {
    const id = randomUUID();
    await sql`
      insert into cards (id, user_id, nickname, brand, holder, last4, full_number, expiry, card_limit, balance)
      values (${id}, ${userId}, ${nickname ?? null}, ${brand ?? null}, ${holder}, ${last4}, ${fullNumber ?? null}, ${expiry ?? null}, ${limit ?? null}, ${balance ?? null})
    `;
    const cards = await getCards(userId);
    return NextResponse.json({ cardId: id, cards }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save card" }, { status: 500 });
  }
}
