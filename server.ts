import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { authenticateWebSocketConnection } from "./lib/websocket";
import { sql } from "./lib/db";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "8080", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const allowedOrigins = [
  "https://www.trackitco.com",
  "https://trackitco.com",
  "http://localhost:3000",
];

function getCorsOrigin(origin: string | undefined) {
  return origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
}

interface Connection {
  ws: any;
  auth: any;
  userId?: string;
  ticketId?: string;
  streamType?: "tickets" | "ticket-messages" | "transactions";
  pollInterval?: NodeJS.Timeout | null;
  lastMessageTimestamp?: string | null;
}

app.prepare().then(() => {
  const wss = new WebSocketServer({ 
    noServer: true,
    perMessageDeflate: false,
    clientTracking: true
  });

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "", true);
      const origin = getCorsOrigin(req.headers.origin);

      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Expose-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Expose-Headers": "Content-Type",
        });
        res.end();
        return;
      }
      
      if (parsedUrl.pathname === "/api/ws/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", websocket: "enabled", server: "custom", connections: wss.clients.size }));
        return;
      }
      
      if (parsedUrl.pathname === "/api/ws" && req.headers.upgrade !== "websocket") {
        res.writeHead(426, { 
          "Content-Type": "application/json",
          "Upgrade": "websocket"
        });
        res.end(JSON.stringify({ 
          error: "WebSocket upgrade required",
          message: "This endpoint requires a WebSocket upgrade request"
        }));
        return;
      }
      
      if (req.headers.upgrade === "websocket") {
        return;
      }
      
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const parsedUrl = parse(request.url || "", true);
    
    if (parsedUrl.pathname === "/api/ws") {
      socket.on("error", (err) => {
        console.error("[HTTP] Socket error during upgrade:", err);
      });
      
      socket.on("close", () => {
        console.error("[HTTP] Socket closed during upgrade");
      });
      
      try {
        wss.handleUpgrade(request, socket, head, (ws, req) => {
          socket.removeAllListeners("error");
          socket.removeAllListeners("close");
          wss.emit("connection", ws, req);
        });
      } catch (error) {
        console.error("[HTTP] Upgrade error:", error);
        socket.destroy();
      }
    } else {
      socket.destroy();
    }
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
      if (conn?.pollInterval) {
        clearInterval(conn.pollInterval);
        conn.pollInterval = null;
      }
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
          if (conn.pollInterval) {
            clearInterval(conn.pollInterval);
            conn.pollInterval = null;
          }
          conn.lastMessageTimestamp = null;
          conn.pollInterval = setInterval(async () => {
            if (!conn.ticketId || !conn.ws || conn.ws.readyState !== 1) return;
            try {
              if (!conn.lastMessageTimestamp) {
                const latest = (await sql`
                  select created_at
                  from ticket_messages
                  where ticket_id = ${conn.ticketId}
                  order by created_at desc
                  limit 1
                `) as Array<{ created_at: string }>;
                if (latest[0]) {
                  conn.lastMessageTimestamp = latest[0].created_at;
                }
                return;
              }

              const rows = (await sql`
                select 
                  id,
                  ticket_id,
                  user_id,
                  sender_type,
                  content,
                  created_at
                from ticket_messages
                where ticket_id = ${conn.ticketId}
                  and created_at > ${conn.lastMessageTimestamp}
                order by created_at asc
              `) as Array<{
                id: string;
                ticket_id: string;
                user_id: string | null;
                sender_type: "user" | "support";
                content: string;
                created_at: string;
              }>;

              if (rows.length > 0) {
                for (const message of rows) {
                  conn.ws.send(JSON.stringify({ type: "message", message }));
                  if (!conn.lastMessageTimestamp || message.created_at > conn.lastMessageTimestamp) {
                    conn.lastMessageTimestamp = message.created_at;
                  }
                }
              }
            } catch {
            }
          }, 2000);
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

  (global as any).wsBroadcast = {
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

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server listening on /api/ws`);
  });
  
  wss.on("error", (error) => {
    console.error("[WebSocket] Server error:", error);
  });
});
