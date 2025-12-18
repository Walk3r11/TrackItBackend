import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

type Numeric = string | number | null;

type CardRow = {
  id: string;
  nickname: string | null;
  card_limit: Numeric;
  daily_limit: Numeric;
  weekly_limit: Numeric;
  monthly_limit: Numeric;
  balance: Numeric;
  tags: string[] | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: corsHeaders });
}

const toNumber = (value: Numeric) => Number(value ?? 0);

const mapCard = (row: CardRow) => ({
  id: row.id,
  nickname: row.nickname ?? "",
  cardLimit: toNumber(row.monthly_limit ?? row.card_limit),
  dailyLimit: row.daily_limit == null ? null : toNumber(row.daily_limit),
  weeklyLimit: row.weekly_limit == null ? null : toNumber(row.weekly_limit),
  monthlyLimit: row.monthly_limit == null ? null : toNumber(row.monthly_limit),
  balance: toNumber(row.balance),
  tags: row.tags ?? []
});

async function getCards(userId: string) {
  const rows = (await sql`
    select
      id,
      nickname,
      coalesce(card_limit, 0) as card_limit,
      daily_limit,
      weekly_limit,
      monthly_limit,
      coalesce(balance, 0) as balance,
      coalesce(tags, '{}') as tags
    from cards
    where user_id = ${userId}
    order by created_at desc
  `) as CardRow[];
  return rows.map(mapCard);
}

async function recalcUserBalance(userId: string) {
  await sql`
    update users
    set balance = coalesce((select sum(balance) from cards where user_id = ${userId}), 0),
        monthly_spend = coalesce(
          (select sum(coalesce(monthly_limit, card_limit, 0)) from cards where user_id = ${userId}),
          monthly_spend
        )
    where id = ${userId}
  `;
}

function parsePeriod(period: unknown): "daily" | "weekly" | "monthly" | null {
  if (typeof period !== "string") return null;
  const normalized = period.trim().toLowerCase();
  if (normalized === "daily" || normalized === "weekly" || normalized === "monthly") return normalized;
  return null;
}

function parseLimits(body: any) {
  const hasAnyMulti =
    body?.dailyLimit !== undefined ||
    body?.weeklyLimit !== undefined ||
    body?.monthlyLimit !== undefined ||
    body?.daily_limit !== undefined ||
    body?.weekly_limit !== undefined ||
    body?.monthly_limit !== undefined;

  const dailyLimit = body?.dailyLimit ?? body?.daily_limit ?? null;
  const weeklyLimit = body?.weeklyLimit ?? body?.weekly_limit ?? null;
  const monthlyLimit = body?.monthlyLimit ?? body?.monthly_limit ?? null;

  let resolvedDaily: number | null = dailyLimit ?? null;
  let resolvedWeekly: number | null = weeklyLimit ?? null;
  let resolvedMonthly: number | null = monthlyLimit ?? null;

  if (!hasAnyMulti) {
    const legacyLimit = body?.limit ?? body?.cardLimit ?? body?.card_limit ?? null;
    const legacyPeriod = parsePeriod(body?.limitPeriod ?? body?.period ?? body?.limit_period);

    if (legacyLimit != null && legacyPeriod) {
      if (legacyPeriod === "daily") resolvedDaily = legacyLimit;
      if (legacyPeriod === "weekly") resolvedWeekly = legacyLimit;
      if (legacyPeriod === "monthly") resolvedMonthly = legacyLimit;
    } else if (legacyLimit != null) {
      resolvedMonthly = legacyLimit;
    }
  }

  const legacyCardLimit = resolvedMonthly ?? body?.limit ?? body?.cardLimit ?? body?.card_limit ?? null;

  return {
    dailyLimit: resolvedDaily,
    weeklyLimit: resolvedWeekly,
    monthlyLimit: resolvedMonthly,
    legacyCardLimit
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400, headers: corsHeaders });
  try {
    const cards = await getCards(userId);
    return NextResponse.json({ cards }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load cards" }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { userId, nickname, balance, tags } = body;
  if (!userId || !nickname) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
  }
  try {
    const id = randomUUID();
    const limits = parseLimits(body);
    await sql`
      insert into cards (id, user_id, nickname, card_limit, daily_limit, weekly_limit, monthly_limit, balance, tags)
      values (
        ${id},
        ${userId},
        ${nickname},
        ${limits.legacyCardLimit ?? null},
        ${limits.dailyLimit ?? null},
        ${limits.weeklyLimit ?? null},
        ${limits.monthlyLimit ?? null},
        ${balance ?? null},
        ${tags ?? []}
      )
    `;
    await recalcUserBalance(userId);
    const cards = await getCards(userId);
    return NextResponse.json({ cardId: id, cards }, { status: 201, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save card" }, { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, userId, balance, tags, nickname } = body;
  if (!id || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
  }
  try {
    const limits = parseLimits(body);
    await sql`
      update cards
          set balance = ${balance ?? null},
          card_limit = coalesce(${limits.legacyCardLimit ?? null}, card_limit),
          daily_limit = coalesce(${limits.dailyLimit ?? null}, daily_limit),
          weekly_limit = coalesce(${limits.weeklyLimit ?? null}, weekly_limit),
          monthly_limit = coalesce(${limits.monthlyLimit ?? null}, monthly_limit),
          nickname = coalesce(${nickname ?? null}, nickname),
          tags = coalesce(${tags ?? null}, tags),
          updated_at = now()
      where id = ${id} and user_id = ${userId}
    `;
    await recalcUserBalance(userId);
    const cards = await getCards(userId);
    return NextResponse.json({ cards }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update card" }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const userId = searchParams.get("userId");
  if (!id || !userId) {
    return NextResponse.json({ error: "Missing id or userId" }, { status: 400, headers: corsHeaders });
  }
  try {
    await sql`delete from cards where id = ${id} and user_id = ${userId}`;
    await recalcUserBalance(userId);
    const cards = await getCards(userId);
    return NextResponse.json({ cards }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete card" }, { status: 500, headers: corsHeaders });
  }
}
