import { NextResponse } from "next/server";
import { lookupUser, lookupSupportUser } from "@/lib/data";
import { sql } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const direct = await lookupUser(query);
    const support = await lookupSupportUser(query);
    const appUsers = await sql`
      select id, sequence_id, email from app_users
      where lower(email) = ${query.toLowerCase()} or id::text = ${query}
         or ('t-' || lpad(sequence_id::text, 6, '0')) = ${query.toLowerCase()}
      limit 3
    `;
    return NextResponse.json({ direct, support, appUsers });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
