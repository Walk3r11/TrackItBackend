import { sql } from "@/lib/db";
import { authenticateWebSocketConnection, createWebSocketMessage, AuthenticatedConnection } from "./websocket";

export interface WebSocketClient {
  send: (data: string) => void;
  close: () => void;
  readyState: number;
}

const CONNECTED = 1;

export class WebSocketHandler {
  private client: WebSocketClient;
  private auth: AuthenticatedConnection | null = null;
  private userId: string | null = null;
  private ticketId: string | null = null;
  private subscriptionType: "tickets" | "ticket-messages" | "transactions" | null = null;
  private isActive = true;
  private pollInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastTicketTimestamp: string | null = null;
  private lastTransactionTimestamp: string | null = null;
  private lastMessageTimestamp: string | null = null;
  private lastStatus: string | null = null;

  constructor(client: WebSocketClient) {
    this.client = client;
    this.setupPingPong();
  }

  private setupPingPong() {
    this.pingInterval = setInterval(() => {
      if (this.isActive && this.client.readyState === CONNECTED) {
        try {
          this.client.send(createWebSocketMessage("ping"));
        } catch (e) {
          this.cleanup();
        }
      }
    }, 30000);
  }

  async handleMessage(message: string) {
    try {
      const parsed = JSON.parse(message);
      const { type, token, userId, ticketId, supportUserId, streamType } = parsed;

      switch (type) {
        case "auth":
          await this.handleAuth(token, userId, supportUserId);
          break;
        case "subscribe":
          if (streamType === "tickets") {
            await this.handleTicketsSubscription();
          } else if (streamType === "ticket-messages" && ticketId) {
            await this.handleTicketSubscription(ticketId);
          } else if (streamType === "transactions") {
            await this.handleTransactionsSubscription();
          }
          break;
        case "pong":
          break;
        default:
          this.sendError("Unknown message type");
      }
    } catch (error) {
      this.sendError("Invalid message format");
    }
  }

  private async handleAuth(token: string, userId?: string, supportUserId?: string) {
    const auth = await authenticateWebSocketConnection(token, supportUserId || undefined);
    
    if (!auth) {
      this.sendError("Authentication failed");
      this.cleanup();
      return;
    }

    this.auth = auth;
    this.userId = userId || auth.userId;
    
    this.send(createWebSocketMessage("auth", { authenticated: true, userId: this.userId }));
  }

  private async handleTicketsSubscription() {
    if (!this.auth || !this.userId) {
      this.sendError("Not authenticated");
      return;
    }

    if (this.auth.isSupport && this.auth.userId !== this.userId) {
      this.sendError("Access denied");
      return;
    }

    this.subscriptionType = "tickets";
    this.send(createWebSocketMessage("subscribed", { type: "tickets" }));
    this.startTicketsPolling();
  }

  private async handleTicketSubscription(ticketId: string) {
    if (!this.auth || !this.userId) {
      this.sendError("Not authenticated");
      return;
    }

    const ticketRows = (await sql`
      select user_id from tickets where id = ${ticketId} limit 1
    `) as Array<{ user_id: string }>;

    if (ticketRows.length === 0) {
      this.sendError("Ticket not found");
      return;
    }

    if (this.auth.isSupport) {
      if (ticketRows[0].user_id !== this.auth.supportUserId) {
        this.sendError("Access denied");
        return;
      }
    } else {
      if (ticketRows[0].user_id !== this.auth.userId) {
        this.sendError("Access denied");
        return;
      }
    }

    this.ticketId = ticketId;
    this.subscriptionType = "ticket-messages";
    this.send(createWebSocketMessage("subscribed", { type: "ticket-messages", ticketId }));
    this.startTicketMessagesPolling();
  }

  private async handleTransactionsSubscription() {
    if (!this.auth || !this.userId) {
      this.sendError("Not authenticated");
      return;
    }

    if (this.auth.isSupport && this.auth.userId !== this.userId) {
      this.sendError("Access denied");
      return;
    }

    this.subscriptionType = "transactions";
    this.send(createWebSocketMessage("subscribed", { type: "transactions" }));
    this.startTransactionsPolling();
  }

  private startTicketsPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (!this.isActive || !this.userId) return;

      try {
        if (!this.lastTicketTimestamp) {
          const latestTicket = (await sql`
            select updated_at, created_at
            from tickets
            where user_id = ${this.userId}
            order by greatest(updated_at, created_at) desc
            limit 1
          `) as Array<{ updated_at: string; created_at: string }>;

          if (latestTicket.length > 0) {
            const latest = latestTicket[0];
            this.lastTicketTimestamp =
              latest.updated_at > latest.created_at
                ? latest.updated_at
                : latest.created_at;
          }
          return;
        }

        const tickets = (await sql`
          select id, user_id, subject, status, priority, updated_at, created_at
          from tickets
          where user_id = ${this.userId}
            and (updated_at > ${this.lastTicketTimestamp} or created_at > ${this.lastTicketTimestamp})
          order by greatest(updated_at, created_at) asc
        `) as Array<{
          id: string;
          user_id: string;
          subject: string;
          status: string;
          priority: string | null;
          updated_at: string;
          created_at: string;
        }>;

        if (tickets.length > 0) {
          for (const ticket of tickets) {
            this.send(
              createWebSocketMessage("ticket", {
                id: ticket.id,
                subject: ticket.subject,
                status: ticket.status,
                priority: ticket.priority ?? undefined,
                updatedAt: ticket.updated_at,
                createdAt: ticket.created_at,
              })
            );

            const ticketTimestamp =
              ticket.updated_at > ticket.created_at
                ? ticket.updated_at
                : ticket.created_at;
            if (ticketTimestamp > this.lastTicketTimestamp) {
              this.lastTicketTimestamp = ticketTimestamp;
            }
          }
        }
      } catch (error) {
        this.sendError("Polling failed");
      }
    }, 2000);
  }

  private startTicketMessagesPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (!this.isActive || !this.ticketId) return;

      try {
        const statusRows = (await sql`
          select status
          from tickets
          where id = ${this.ticketId}
          limit 1
        `) as Array<{ status: string }>;

        if (statusRows.length > 0) {
          const currentStatus = statusRows[0].status;
          if (this.lastStatus !== null && this.lastStatus !== currentStatus) {
            this.send(createWebSocketMessage("status", { status: currentStatus }));
          }
          this.lastStatus = currentStatus;
        }

        if (!this.lastMessageTimestamp) {
          const latestMessage = (await sql`
            select created_at
            from ticket_messages
            where ticket_id = ${this.ticketId}
            order by created_at desc
            limit 1
          `) as Array<{ created_at: string }>;

          if (latestMessage.length > 0) {
            this.lastMessageTimestamp = latestMessage[0].created_at;
          }
          return;
        }

        const messages = (await sql`
          select id, ticket_id, user_id, sender_type, content, created_at
          from ticket_messages
          where ticket_id = ${this.ticketId}
            and created_at > ${this.lastMessageTimestamp}
          order by created_at asc
        `) as Array<{
          id: string;
          ticket_id: string;
          user_id: string | null;
          sender_type: "user" | "support";
          content: string;
          created_at: string;
        }>;

        if (messages.length > 0) {
          for (const message of messages) {
            this.send(createWebSocketMessage("message", message));
            if (message.created_at > this.lastMessageTimestamp) {
              this.lastMessageTimestamp = message.created_at;
            }
          }
        }
      } catch (error) {
        this.sendError("Polling failed");
      }
    }, 1000);
  }

  private startTransactionsPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (!this.isActive || !this.userId) return;

      try {
        if (!this.lastTransactionTimestamp) {
          const latestTx = (await sql`
            select created_at
            from transactions
            where user_id = ${this.userId}
            order by created_at desc
            limit 1
          `) as Array<{ created_at: string }>;

          if (latestTx.length > 0) {
            this.lastTransactionTimestamp = latestTx[0].created_at;
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
          where t.user_id = ${this.userId}
            and t.created_at > ${this.lastTransactionTimestamp}
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
          for (const tx of transactions) {
            const toNumber = (value: string | number | null) => Number(value ?? 0);
            this.send(
              createWebSocketMessage("transaction", {
                id: tx.id,
                title: tx.category_name ?? "Transaction",
                amount: toNumber(tx.amount),
                date: tx.created_at,
                type: toNumber(tx.amount) >= 0 ? "credit" : "debit",
                category: tx.category_name ?? undefined,
              })
            );

            if (tx.created_at > this.lastTransactionTimestamp) {
              this.lastTransactionTimestamp = tx.created_at;
            }
          }
        }
      } catch (error) {
        this.sendError("Polling failed");
      }
    }, 2000);
  }

  private send(message: string) {
    if (this.isActive && this.client.readyState === CONNECTED) {
      try {
        this.client.send(message);
      } catch (e) {
        this.cleanup();
      }
    }
  }

  private sendError(error: string) {
    this.send(createWebSocketMessage("error", undefined, error));
  }

  cleanup() {
    this.isActive = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
