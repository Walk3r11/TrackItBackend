import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type Numeric = string | number | null;

const toNumber = (value: Numeric) => Number(value ?? 0);

export async function GET() {
  try {
    const [summary] = (await sql`
      select
        coalesce(sum(balance), 0) as total_balance,
        coalesce(sum(monthly_spend), 0) as monthly_volume,
        count(*) as users,
        coalesce(count(*) filter (where last_active > now() - interval '7 days'), 0) as active_users
      from users
    `) as {
      total_balance: Numeric;
      monthly_volume: Numeric;
      users: number;
      active_users: number;
    }[];

    return NextResponse.json({
      summary: {
        totalBalance: toNumber(summary?.total_balance ?? 0),
        monthlyVolume: toNumber(summary?.monthly_volume ?? 0),
        users: summary?.users ?? 0,
        activeUsers: summary?.active_users ?? 0
      }
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}
