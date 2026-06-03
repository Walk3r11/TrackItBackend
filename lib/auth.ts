import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getAppUserAuth } from "@/lib/data";

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie");

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  if (cookieHeader) {
    const cookieMatch = cookieHeader.match(/auth-token=([^;]+)/);
    if (cookieMatch) return cookieMatch[1];
  }
  return null;
}

export async function getSessionUserId(request: Request): Promise<string | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  try {
    const tokenHash = hashToken(token);
    const rows = (await sql`
      select u.id as user_id
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${tokenHash}
        and s.revoked_at is null
        and s.expires_at > now()
      limit 1
    `) as Array<{ user_id: string }>;

    return rows[0]?.user_id ?? null;
  } catch {
    return null;
  }
}

export async function verifySupportJwt(request: Request): Promise<boolean> {
  const token = extractBearerToken(request);
  if (!token) return false;

  const secret = process.env.JWT_SECRET;
  if (!secret) return false;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload.role === "support";
  } catch {
    return false;
  }
}

export function unauthorizedResponse(
  corsHeaders: Record<string, string>,
  message = "Unauthorized"
) {
  return NextResponse.json({ error: message }, { status: 401, headers: corsHeaders });
}

export function forbiddenResponse(corsHeaders: Record<string, string>, message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403, headers: corsHeaders });
}

export async function requireSessionForUserId(
  request: Request,
  requestedUserId: string | null | undefined,
  corsHeaders: Record<string, string>
): Promise<{ userId: string } | NextResponse> {
  const sessionUserId = await getSessionUserId(request);
  if (!sessionUserId) {
    return unauthorizedResponse(corsHeaders);
  }

  if (requestedUserId && requestedUserId !== sessionUserId) {
    return forbiddenResponse(corsHeaders);
  }

  return { userId: sessionUserId };
}

export async function verifyAppUserPassword(email: string, password: string): Promise<boolean> {
  const authRow = await getAppUserAuth(email);
  if (!authRow) return false;

  const currentPepper = process.env.HASH_PEPPER_CURRENT;
  const previousPepper = process.env.HASH_PEPPER_PREVIOUS;
  if (!currentPepper) return false;

  const peppers = [
    currentPepper,
    ...(previousPepper ? [previousPepper] : [])
  ];

  for (const pepper of peppers) {
    if (await bcrypt.compare(pepper + password, authRow.password_hash)) {
      return true;
    }
  }
  return false;
}

export function getJwtSecretKey(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}
