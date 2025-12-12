import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

async function getCards(userId: string) {
  const rows = await sql`
    select
      id,
      nickname,
      coalesce(card_limit, 0) as card_limit,
      coalesce(balance, 0) as balance,
      coalesce(tags, '{}') as tags
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
  const { userId, nickname, limit, balance, tags } = body;
  if (!userId || !nickname) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  try {
    const id = randomUUID();
    await sql`
      insert into cards (id, user_id, nickname, card_limit, balance, tags)
      values (${id}, ${userId}, ${nickname}, ${limit ?? null}, ${balance ?? null}, ${tags ?? []})
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
  const { id, userId, balance, limit, tags, nickname } = body;
  if (!id || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  try {
    await sql`
      update cards
          set balance = ${balance ?? null},
          card_limit = ${limit ?? null},
          nickname = coalesce(${nickname ?? null}, nickname),
          tags = coalesce(${tags ?? null}, tags),
          updated_at = now()
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
