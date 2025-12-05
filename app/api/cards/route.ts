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

async function recalcUserBalance(userId: string) {
  await sql`
    update users
    set balance = coalesce((select sum(balance) from cards where user_id = ${userId}), 0),
        monthly_spend = coalesce((select sum(card_limit) from cards where user_id = ${userId}), monthly_spend)
    where id = ${userId}
  `;
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
    await recalcUserBalance(userId);
    const cards = await getCards(userId);
    return NextResponse.json({ cardId: id, cards }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save card" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, userId, balance, limit } = body;
  if (!id || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  try {
    await sql`
      update cards
      set balance = ${balance ?? null}, card_limit = ${limit ?? null}, updated_at = now()
      where id = ${id} and user_id = ${userId}
    `;
    await recalcUserBalance(userId);
    const cards = await getCards(userId);
    return NextResponse.json({ cards }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const userId = searchParams.get("userId");
  if (!id || !userId) {
    return NextResponse.json({ error: "Missing id or userId" }, { status: 400 });
  }
  try {
    await sql`delete from cards where id = ${id} and user_id = ${userId}`;
    await recalcUserBalance(userId);
    const cards = await getCards(userId);
    return NextResponse.json({ cards }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete card" }, { status: 500 });
  }
}
