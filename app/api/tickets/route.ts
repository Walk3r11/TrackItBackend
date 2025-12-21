import { NextResponse } from "next/server";
import { getUserTickets } from "@/lib/data";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status") ?? undefined;
  if (!userId)
    return NextResponse.json(
      { error: "Missing userId" },
      { status: 400, headers: corsHeaders }
    );

  try {
    const tickets = await getUserTickets(userId, status ?? undefined);
    return NextResponse.json({ tickets }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { tickets: [], error: "Failed to load tickets" },
      { status: 200, headers: corsHeaders }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { userId, subject, status, priority, initialMessage } = body;
  if (!userId || !subject) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400, headers: corsHeaders }
    );
  }
  try {
    const id = randomUUID();
    await sql`
      insert into tickets (id, user_id, subject, status, priority)
      values (${id}, ${userId}, ${subject}, ${status ?? "open"}, ${
      priority ?? null
    })
    `;

    if (
      initialMessage &&
      typeof initialMessage === "string" &&
      initialMessage.trim().length > 0
    ) {
      const messageId = randomUUID();
      await sql`
        insert into ticket_messages (id, ticket_id, user_id, sender_type, content)
        values (${messageId}, ${id}, ${userId}, 'user', ${initialMessage.trim()})
      `;
    }

    const tickets = await getUserTickets(userId, "all");
    return NextResponse.json(
      { ticketId: id, tickets },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create ticket" },
      { status: 500, headers: corsHeaders }
    );
  }
}
