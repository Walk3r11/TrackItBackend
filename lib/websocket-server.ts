import { WebSocketHandler } from "./websocket-handler";

export interface WebSocketConnection {
  id: string;
  handler: WebSocketHandler;
  userId?: string;
  ticketId?: string;
  streamType?: "tickets" | "ticket-messages" | "transactions";
}

class WebSocketServer {
  private connections: Map<string, WebSocketConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private ticketConnections: Map<string, Set<string>> = new Map();

  addConnection(ws: any, connectionId: string): WebSocketHandler {
    const handler = new WebSocketHandler(ws);
    const connection: WebSocketConnection = {
      id: connectionId,
      handler,
    };

    this.connections.set(connectionId, connection);

    ws.on("close", () => {
      this.removeConnection(connectionId);
    });

    ws.on("error", () => {
      this.removeConnection(connectionId);
    });

    ws.on("message", async (message: Buffer) => {
      await handler.handleMessage(message.toString());
    });

    return handler;
  }

  updateConnection(
    connectionId: string,
    userId?: string,
    ticketId?: string,
    streamType?: "tickets" | "ticket-messages" | "transactions"
  ) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    if (connection.userId && connection.userId !== userId) {
      const oldUserSet = this.userConnections.get(connection.userId);
      if (oldUserSet) {
        oldUserSet.delete(connectionId);
        if (oldUserSet.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
    }

    if (connection.ticketId && connection.ticketId !== ticketId) {
      const oldTicketSet = this.ticketConnections.get(connection.ticketId);
      if (oldTicketSet) {
        oldTicketSet.delete(connectionId);
        if (oldTicketSet.size === 0) {
          this.ticketConnections.delete(connection.ticketId);
        }
      }
    }

    connection.userId = userId;
    connection.ticketId = ticketId;
    connection.streamType = streamType;

    if (userId) {
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId)!.add(connectionId);
    }

    if (ticketId) {
      if (!this.ticketConnections.has(ticketId)) {
        this.ticketConnections.set(ticketId, new Set());
      }
      this.ticketConnections.get(ticketId)!.add(connectionId);
    }
  }

  private removeConnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    if (connection.userId) {
      const userSet = this.userConnections.get(connection.userId);
      if (userSet) {
        userSet.delete(connectionId);
        if (userSet.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
    }

    if (connection.ticketId) {
      const ticketSet = this.ticketConnections.get(connection.ticketId);
      if (ticketSet) {
        ticketSet.delete(connectionId);
        if (ticketSet.size === 0) {
          this.ticketConnections.delete(connection.ticketId);
        }
      }
    }

    this.connections.delete(connectionId);
  }

  broadcastToUser(userId: string, message: any) {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return;

    const messageStr = typeof message === "string" ? message : JSON.stringify(message);

    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.handler) {
        try {
          connection.handler.send(messageStr);
        } catch (error) {
          this.removeConnection(connectionId);
        }
      }
    }
  }

  broadcastToTicket(ticketId: string, message: any) {
    const connectionIds = this.ticketConnections.get(ticketId);
    if (!connectionIds) return;

    const messageStr = typeof message === "string" ? message : JSON.stringify(message);

    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.handler) {
        try {
          connection.handler.send(messageStr);
        } catch (error) {
          this.removeConnection(connectionId);
        }
      }
    }
  }
}

export const wsServer = new WebSocketServer();
