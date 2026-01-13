import { NextResponse } from "next/server";
import { clearUserCategories, ensureUncategorizedCategory, getOrCreateCategoryByName, listCategories } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Content-Type",
  };
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400, headers: corsHeaders });

  try {
    await ensureUncategorizedCategory(userId);
    const categories = await listCategories(userId);
    return NextResponse.json({ categories }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const body = (await request.json().catch(() => ({}))) as { userId?: string; name?: string; color?: string | null };
  const userId = body.userId;
  if (!userId || !body.name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
  }

  try {
    const category = await getOrCreateCategoryByName(userId, body.name, body.color ?? null);
    const categories = await listCategories(userId);
    return NextResponse.json({ category, categories }, { status: 201, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save category" }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const url = new URL(request.url);
  const userIdFromQuery = url.searchParams.get("userId");
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = userIdFromQuery ?? body.userId;

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400, headers: corsHeaders });

  try {
    const categories = await clearUserCategories(userId);
    return NextResponse.json({ cleared: true, categories }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to clear categories" }, { status: 500, headers: corsHeaders });
  }
}
