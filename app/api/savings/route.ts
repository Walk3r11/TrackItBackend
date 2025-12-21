import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSavingsGoal, updateSavingsGoal } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Numeric = string | number | null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: corsHeaders });
}

const toNumber = (value: Numeric) => Number(value ?? 0);

function parsePeriod(period: string | null | undefined): "daily" | "weekly" | "monthly" | null {
  if (!period) return null;
  const normalized = period.trim().toLowerCase();
  if (normalized === "daily" || normalized === "weekly" || normalized === "monthly") return normalized;
  return null;
}

async function getNetSavedForPeriod(userId: string, period: "daily" | "weekly" | "monthly") {
  const granularity = period === "daily" ? "day" : period === "weekly" ? "week" : "month";
  const [row] = (await sql`
    select coalesce(sum(amount), 0) as net
    from transactions
    where user_id = ${userId}
      and created_at >= date_trunc(${granularity}, now())
  `) as { net: Numeric }[];
  return toNumber(row?.net ?? 0);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400, headers: corsHeaders });

  try {
    const goal = await getSavingsGoal(userId);
    const requestedPeriod = parsePeriod(searchParams.get("period"));
    const period = requestedPeriod ?? goal.goalPeriod;
    const netAmount = await getNetSavedForPeriod(userId, period);
    const savedAmount = Math.max(0, netAmount);
    const reached = goal.goalAmount > 0 ? savedAmount >= goal.goalAmount : false;

    return NextResponse.json(
      { goal: { ...goal, goalPeriod: period }, netAmount, savedAmount, reached },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json({ error: "Failed to load savings" }, { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    goalAmount?: number | null;
    goalPeriod?: string;
  };
  const userId = body.userId;
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400, headers: corsHeaders });

  try {
    const goal = await updateSavingsGoal({ userId, goalAmount: body.goalAmount, goalPeriod: body.goalPeriod });
    const period = goal.goalPeriod;
    const netAmount = await getNetSavedForPeriod(userId, period);
    const savedAmount = Math.max(0, netAmount);
    const reached = goal.goalAmount > 0 ? savedAmount >= goal.goalAmount : false;

    return NextResponse.json({ goal, netAmount, savedAmount, reached }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update savings" }, { status: 500, headers: corsHeaders });
  }
}
