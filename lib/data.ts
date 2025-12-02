import { sql } from "./db";

type Numeric = string | number | null;

type UserRow = {
  id: string;
  name: string;
  email: string;
  balance: Numeric;
  monthly_spend: Numeric;
  last_active: string;
  created_at: string;
};

type TicketRow = {
  id: string;
  user_id: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "medium" | "high" | null;
  updated_at: string;
  created_at: string;
};

const toNumber = (value: Numeric) => Number(value ?? 0);

const mapUser = (row: UserRow) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  balance: toNumber(row.balance),
  monthlySpend: toNumber(row.monthly_spend),
  lastActive: row.last_active,
  createdAt: row.created_at
});

const mapTicket = (row: TicketRow) => ({
  id: row.id,
  userId: row.user_id,
  subject: row.subject,
  status: row.status,
  priority: row.priority ?? undefined,
  updatedAt: row.updated_at,
  createdAt: row.created_at
});

export async function lookupUser(query: string) {
  const rows = (await sql`
    select id, name, email, balance, monthly_spend, last_active, created_at
    from users
    where email = ${query} or id::text = ${query}
    limit 1
  `) as UserRow[];
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function getUserTickets(userId: string, status?: string) {
  const whereStatus = status && status !== "all" ? sql`and status = ${status}` : sql``;
  const rows = (await sql`
    select id, user_id, subject, status, priority, updated_at, created_at
    from tickets
    where user_id = ${userId}
    ${whereStatus}
    order by updated_at desc
    limit 50
  `) as TicketRow[];
  return rows.map(mapTicket);
}

export async function getUserSeries(userId: string) {
  const rows = (await sql`
    select to_char(date_trunc('month', created_at), 'Mon') as label, sum(amount) as value
    from transactions
    where user_id = ${userId}
    group by 1
    order by date_trunc('month', created_at) asc
    limit 6
  `) as { label: string; value: Numeric }[];
  return rows.map((row) => ({ label: row.label, value: toNumber(row.value) }));
}

export async function getUserSummary(userId: string) {
  const rows = (await sql`
    select balance, monthly_spend, last_active
    from users
    where id = ${userId}
    limit 1
  `) as {
    balance: Numeric;
    monthly_spend: Numeric;
    last_active: string;
  }[];
  const summary = rows[0];
  if (!summary) return null;
  return {
    balance: toNumber(summary.balance),
    monthlySpend: toNumber(summary.monthly_spend),
    lastActive: summary.last_active
  };
}
