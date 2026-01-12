import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { authenticateWebSocketConnection } from "./lib/websocket";

const port = parseInt(process.env.PORT || "8080", 10);

interface Connection {
  ws: any;
  auth: any;
  userId?: string;
  ticketId?: string;
  streamType?: "tickets" | "ticket-messages" | "transactions";
}

const wss = new WebSocketServer({ 
  port,
  perMessageDeflate: false,
  clientTracking: true
});

const connections = new Map<string, Connection>();
const userConnections = new Map<string, Set<string>>();
const ticketConnections = new Map<string, Set<string>>();

wss.on("connection", async (ws, req) => {
  const connectionId = randomUUID();
  let isAlive = true;
  let pingInterval: NodeJS.Timeout | null = null;
  
  const cleanup = () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    const conn = connections.get(connectionId);
    if (conn) {
      if (conn.userId && userConnections.has(conn.userId)) {
        userConnections.get(conn.userId)!.delete(connectionId);
        if (userConnections.get(conn.userId)!.size === 0) {
          userConnections.delete(conn.userId);
        }
      }
      if (conn.ticketId && ticketConnections.has(conn.ticketId)) {
        ticketConnections.get(conn.ticketId)!.delete(connectionId);
        if (ticketConnections.get(conn.ticketId)!.size === 0) {
          ticketConnections.delete(conn.ticketId);
        }
      }
    }
    connections.delete(connectionId);
  };
  
  ws.on("pong", () => {
    isAlive = true;
  });
  
  pingInterval = setInterval(() => {
    if (!isAlive) {
      ws.terminate();
      cleanup();
      return;
    }
    isAlive = false;
    try {
      if (ws.readyState === 1) {
        ws.ping();
      } else {
        cleanup();
      }
    } catch (e) {
      cleanup();
    }
  }, 20000);
  
  ws.on("message", async (message: Buffer) => {
    try {
      const parsed = JSON.parse(message.toString());
      
      if (parsed.type === "auth") {
        const auth = await authenticateWebSocketConnection(parsed.token, parsed.supportUserId);
        
        if (!auth) {
          ws.send(JSON.stringify({ type: "error", error: "Authentication failed" }));
          ws.close();
          return;
        }

        const userId = parsed.userId || auth.userId;
        connections.set(connectionId, { ws, auth, userId });
        
        if (userId) {
          if (!userConnections.has(userId)) {
            userConnections.set(userId, new Set());
          }
          userConnections.get(userId)!.add(connectionId);
        }

        ws.send(JSON.stringify({ type: "auth", data: { authenticated: true, userId } }));
      } else if (parsed.type === "subscribe") {
        const conn = connections.get(connectionId);
        if (!conn) {
          ws.send(JSON.stringify({ type: "error", error: "Not authenticated" }));
          return;
        }

        if (parsed.streamType === "ticket-messages" && parsed.ticketId) {
          if (!ticketConnections.has(parsed.ticketId)) {
            ticketConnections.set(parsed.ticketId, new Set());
          }
          ticketConnections.get(parsed.ticketId)!.add(connectionId);
          conn.ticketId = parsed.ticketId;
        }

        if (parsed.streamType === "tickets" || parsed.streamType === "transactions") {
          if (conn.userId) {
            if (!userConnections.has(conn.userId)) {
              userConnections.set(conn.userId, new Set());
            }
            userConnections.get(conn.userId)!.add(connectionId);
          }
        }

        conn.streamType = parsed.streamType;
        ws.send(JSON.stringify({ type: "subscribed", data: { type: parsed.streamType } }));
      } else if (parsed.type === "pong") {
        isAlive = true;
      }
    } catch (error) {
      try {
        ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
      } catch (e) {
        cleanup();
      }
    }
  });

  ws.on("close", () => {
    cleanup();
  });

  ws.on("error", () => {
    cleanup();
  });
});

wss.on("error", (error) => {
  console.error("[WebSocket] Server error:", error);
});

wss.on("listening", () => {
  console.log(`> WebSocket server listening on port ${port}`);
});

export const wsBroadcast = {
  toUser: (userId: string, message: any) => {
    const connectionIds = userConnections.get(userId);
    if (!connectionIds) return;
    const messageStr = typeof message === "string" ? message : JSON.stringify(message);
    for (const id of connectionIds) {
      const conn = connections.get(id);
      if (conn && conn.ws.readyState === 1) {
        try {
          conn.ws.send(messageStr);
        } catch (e) {
          connections.delete(id);
        }
      }
    }
  },
  toTicket: (ticketId: string, message: any) => {
    const connectionIds = ticketConnections.get(ticketId);
    if (!connectionIds) return;
    const messageStr = typeof message === "string" ? message : JSON.stringify(message);
    for (const id of connectionIds) {
      const conn = connections.get(id);
      if (conn && conn.ws.readyState === 1) {
        try {
          conn.ws.send(messageStr);
        } catch (e) {
          connections.delete(id);
        }
      }
    }
  }
};
