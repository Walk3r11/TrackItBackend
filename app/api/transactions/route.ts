import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

type Numeric = string | number | null;

type TransactionRow = {
  id: string;
  user_id: string;
  card_id: string;
  amount: Numeric;
  category: string | null;
  created_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: corsHeaders });
}

const toNumber = (value: Numeric) => Number(value ?? 0);

const mapTransaction = (row: TransactionRow) => ({
  id: row.id,
  userId: row.user_id,
  cardId: row.card_id,
  amount: toNumber(row.amount),
  category: row.category ?? "",
  createdAt: row.created_at
});

async function getTransactions(userId: string) {
  const rows = (await sql`
    select id, user_id, card_id, amount, category, created_at
    from transactions
    where user_id = ${userId}
    order by created_at desc
    limit 100
  `) as TransactionRow[];
  return rows.map(mapTransaction);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400, headers: corsHeaders });
  try {
    const transactions = await getTransactions(userId);
    return NextResponse.json({ transactions }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { userId, amount, category, createdAt } = body as {
    userId?: string;
    cardId?: string;
    card_id?: string;
    amount?: number;
    category?: string;
    createdAt?: string;
  };
  const cardId = (body?.cardId ?? body?.card_id) as string | undefined;

  if (!userId || !cardId || amount == null || !category) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
  }
  try {
    const id = randomUUID();
    await sql`
      insert into transactions (id, user_id, card_id, amount, category, created_at)
      values (${id}, ${userId}, ${cardId ?? null}, ${amount}, ${category}, ${createdAt ?? null})
    `;
    const transactions = await getTransactions(userId);
    return NextResponse.json({ transactionId: id, transactions }, { status: 201, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save transaction" }, { status: 500, headers: corsHeaders });
  }
}
