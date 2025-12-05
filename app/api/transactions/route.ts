import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

async function getTransactions(userId: string) {
  const rows = await sql`
    select id, user_id, amount, category, created_at
    from transactions
    where user_id = ${userId}
    order by created_at desc
    limit 100
  `;
  return rows;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  try {
    const transactions = await getTransactions(userId);
    return NextResponse.json({ transactions });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { userId, amount, category } = body;
  if (!userId || amount == null || !category) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  try {
    const id = randomUUID();
    await sql`
      insert into transactions (id, user_id, amount, category)
      values (${id}, ${userId}, ${amount}, ${category})
    `;
    const transactions = await getTransactions(userId);
    return NextResponse.json({ transactionId: id, transactions }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save transaction" }, { status: 500 });
  }
}
