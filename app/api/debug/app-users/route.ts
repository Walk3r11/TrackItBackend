import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const rows = (await sql`select id, email, sequence_id from app_users limit 5`) as {
      id: string;
      email: string;
      sequence_id: number;
    }[];
    return NextResponse.json({ count: rows.length, sample: rows });
  } catch (error) {
    return NextResponse.json({ error: "Failed to read app_users" }, { status: 500 });
  }
}
