import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { jwtVerify } from "jose";

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "https://www.trackitco.com",
    "https://trackitco.com",
    "http://localhost:3000",
  ];
  
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

export function OPTIONS(request: Request) {
  return NextResponse.json({}, { status: 204, headers: getCorsHeaders(request) });
}

async function authenticateSupport(request: Request): Promise<{ userId: string | null }> {
  const { searchParams } = new URL(request.url);
  const cookieHeader = request.headers.get("cookie");
  const authHeader = request.headers.get("authorization");
  
  let token: string | null = null;
  
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) token = cookieMatch[1];
  }
  
  const tokenParam = searchParams.get("token");
  if (!token && tokenParam) {
    token = decodeURIComponent(tokenParam);
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
  const corsHeaders = getCorsHeaders(request);
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return new Response("Missing userId", { status: 400, headers: corsHeaders });
  }

  const auth = await authenticateSupport(request);
  if (!auth.userId || auth.userId !== userId) {
    console.error(`[Transaction Stream] Auth failed - userId: ${userId}, auth.userId: ${auth.userId}`);
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastTransactionTimestamp: string | null = null;
      let seenTransactionIds = new Set<string>();
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
          if (!lastTransactionTimestamp) {
            const latestTx = (await sql`
              select created_at
              from transactions
              where user_id = ${userId}
              order by created_at desc
              limit 1
            `) as Array<{ created_at: string }>;
            
            if (latestTx.length > 0) {
              lastTransactionTimestamp = latestTx[0].created_at;
              console.log(`[Transaction Stream] Initialized baseline timestamp: ${lastTransactionTimestamp} for user ${userId}`);
            }
            return;
          }

          const transactions = (await sql`
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
              and t.created_at > ${lastTransactionTimestamp}
            order by t.created_at asc
          `) as Array<{
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
            console.log(`[Transaction Stream] Found ${transactions.length} new transaction(s) for user ${userId}`);
            for (const tx of transactions) {
              if (seenTransactionIds.has(tx.id)) {
                continue;
              }
              
              seenTransactionIds.add(tx.id);
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
              
              if (tx.created_at > lastTransactionTimestamp) {
                lastTransactionTimestamp = tx.created_at;
              }
            }
          }
        } catch (error) {
          console.error("[Transaction Stream] Error polling transactions:", error);
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
      ...getCorsHeaders(request),
    },
  });
}
