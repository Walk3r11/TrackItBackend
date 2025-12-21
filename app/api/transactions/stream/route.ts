import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { jwtVerify } from "jose";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: corsHeaders });
}

async function authenticateSupport(request: Request): Promise<{ userId: string | null }> {
  const { searchParams } = new URL(request.url);
  const cookieHeader = request.headers.get("cookie");
  
  let token: string | null = null;
  
  if (cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) token = cookieMatch[1];
  }
  
  if (!token) {
    return { userId: null };
  }

  try {
    const JWT_SECRET = new TextEncoder().encode(
      process.env.JWT_SECRET
    );
    
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.role === "support") {
      const userId = searchParams.get("userId");
      return { userId: userId || null };
    }
  } catch {
  }
  
  return { userId: null };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return new Response("Missing userId", { status: 400 });
  }

  const auth = await authenticateSupport(request);
  if (!auth.userId || auth.userId !== userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastTransactionId: string | null = null;
      let isActive = true;

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );

      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const query = lastTransactionId
            ? sql`
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
                  and t.id > ${lastTransactionId}
                order by t.created_at asc
              `
            : sql`
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
                order by t.created_at desc
                limit 1
              `;

          const transactions = (await query) as Array<{
            id: string;
            user_id: string;
            card_id: string;
            amount: string | number | null;
            category_id: string | null;
            category_name: string | null;
            category_color: string | null;
            created_at: string;
          }>;

          if (transactions.length > 0) {
            const newTransactions = lastTransactionId ? transactions : transactions.reverse();

            for (const tx of newTransactions) {
              const toNumber = (value: string | number | null) => Number(value ?? 0);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "transaction",
                    transaction: {
                      id: tx.id,
                      title: tx.category_name ?? "Transaction",
                      amount: toNumber(tx.amount),
                      date: tx.created_at,
                      type: toNumber(tx.amount) >= 0 ? "credit" : "debit",
                      category: tx.category_name ?? undefined,
                    },
                  })}\n\n`
                )
              );
              lastTransactionId = tx.id;
            }
          }
        } catch (error) {
          console.error("Error polling transactions:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Polling failed",
              })}\n\n`
            )
          );
        }
      }, 2000);

      request.signal.addEventListener("abort", () => {
        isActive = false;
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders,
    },
  });
}

