import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
import { ensureUncategorizedCategory, getOrCreateCategoryByName } from "@/lib/data";

export const dynamic = "force-dynamic";

type Numeric = string | number | null;

type TransactionRow = {
  id: string;
  user_id: string;
  card_id: string;
  amount: Numeric;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
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
  categoryId: row.category_id,
  category: row.category_name ?? "Uncategorized",
  categoryColor: row.category_color ?? undefined,
  createdAt: row.created_at
});

async function getTransactions(userId: string) {
  const rows = (await sql`
    select
      t.id,
      t.user_id,
      t.card_id,
      t.amount,
      t.category_id,
      c.name as category_name,
      c.color as category_color,
      t.created_at
    from transactions t
    left join categories c on c.id = t.category_id
    where t.user_id = ${userId}
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
  const { userId, amount, createdAt } = body as {
    userId?: string;
    cardId?: string;
    card_id?: string;
    amount?: number;
    category?: string;
    categoryId?: string;
    category_id?: string;
    categoryName?: string;
    createdAt?: string;
  };
  const cardId = (body?.cardId ?? body?.card_id) as string | undefined;

  if (!userId || !cardId || amount == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
  }
  try {
    const id = randomUUID();
    const categoryId = (body?.categoryId ?? body?.category_id) as string | undefined;
    const categoryName = (body?.categoryName ?? body?.category) as string | undefined;

    let resolvedCategory = null as null | { id: string; name: string | null };
    if (categoryId) {
      const rows = (await sql`
        select id, name
        from categories
        where id = ${categoryId} and user_id = ${userId}
        limit 1
      `) as { id: string; name: string }[];
      if (rows[0]) resolvedCategory = { id: rows[0].id, name: rows[0].name };
    }
    if (!resolvedCategory && categoryName) {
      const created = await getOrCreateCategoryByName(userId, categoryName);
      resolvedCategory = { id: created.id, name: created.name };
    }
    if (!resolvedCategory) {
      const fallback = await ensureUncategorizedCategory(userId);
      resolvedCategory = { id: fallback.id, name: fallback.name };
    }

    await sql`
      insert into transactions (id, user_id, card_id, amount, category_id, category, created_at)
      values (
        ${id},
        ${userId},
        ${cardId ?? null},
        ${amount},
        ${resolvedCategory.id},
        ${resolvedCategory.name ?? "Uncategorized"},
        ${createdAt ?? null}
      )
    `;
    const transactions = await getTransactions(userId);
    return NextResponse.json({ transactionId: id, transactions }, { status: 201, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save transaction" }, { status: 500, headers: corsHeaders });
  }
}
