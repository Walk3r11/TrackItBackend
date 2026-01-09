import { sql } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { jwtVerify } from "jose";

export interface WebSocketMessage {
  type: string;
  data?: any;
  error?: string;
}

export interface AuthenticatedConnection {
  userId: string;
  isSupport: boolean;
  supportUserId?: string;
  ticketId?: string;
}

export async function authenticateWebSocketConnection(
  token: string | null,
  supportUserId?: string | null
): Promise<AuthenticatedConnection | null> {
  if (!token) return null;

  try {
    const JWT_SECRET = new TextEncoder().encode(
      process.env.JWT_SECRET || "trackit-secret"
    );

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.role === "support" && supportUserId) {
        return {
          userId: supportUserId,
          isSupport: true,
          supportUserId,
        };
      }
    } catch {
    }

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

    if (rows.length === 0) return null;

    return {
      userId: rows[0].user_id,
      isSupport: false,
    };
  } catch {
    return null;
  }
}

export function createWebSocketMessage(type: string, data?: any, error?: string): string {
  return JSON.stringify({ type, data, error } as WebSocketMessage);
}
