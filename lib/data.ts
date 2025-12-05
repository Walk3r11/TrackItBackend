import { sql } from "./db";

type Numeric = string | number | null;

type UserRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string;
  balance: Numeric;
  monthly_spend: Numeric;
  last_active: string;
  created_at: string;
  password_hash?: string | null;
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

type AppUserAuthRow = UserRow & {
  password_hash: string;
};

const toNumber = (value: Numeric) => Number(value ?? 0);

const mapUser = (row: UserRow) => ({
  id: row.id,
  name: row.name ?? [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ").trim(),
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
    select id, name, first_name, middle_name, last_name, email, balance, monthly_spend, last_active, created_at
    from users
    where email = ${query} or id::text = ${query}
    limit 1
  `) as UserRow[];
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function lookupSupportUser(query: string) {
  const cleaned = query.trim().toLowerCase();
  const rows = (await sql`
    select id, name, first_name, middle_name, last_name, email, balance, monthly_spend, last_active, created_at
    from users
    where lower(email) = ${cleaned} or id::text = ${query}
    limit 1
  `) as UserRow[];
  return rows[0] ? { user: mapUser(rows[0]), source: "users" as const } : null;
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
    with buckets as (
      select date_trunc('month', created_at) as bucket, sum(amount) as value
      from transactions
      where user_id = ${userId}
      group by bucket
      order by bucket asc
      limit 6
    )
    select to_char(bucket, 'Mon') as label, value from buckets
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

const mapAppUser = (row: UserRow) => ({
  id: row.id,
  firstName: row.first_name,
  middleName: row.middle_name,
  lastName: row.last_name,
  email: row.email,
  createdAt: row.created_at
});

export async function findAppUserByEmail(email: string) {
  const rows = (await sql`
    select id, name, first_name, middle_name, last_name, email, balance, monthly_spend, last_active, created_at
    from users
    where email = ${email}
    limit 1
  `) as UserRow[];
  return rows[0] ? mapAppUser(rows[0]) : null;
}

export async function getAppUserAuth(email: string) {
  const rows = (await sql`
    select id, name, first_name, middle_name, last_name, email, password_hash, balance, monthly_spend, last_active, created_at
    from users
    where email = ${email}
    limit 1
  `) as AppUserAuthRow[];
  return rows[0] ?? null;
}

export async function createAppUser(input: {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  passwordHash: string;
}) {
  const rows = (await sql`
    insert into users (first_name, middle_name, last_name, email, password_hash, balance, monthly_spend, last_active, created_at, name)
    values (${input.firstName}, ${input.middleName}, ${input.lastName}, ${input.email}, ${input.passwordHash}, 0, 0, now(), now(),
            ${[input.firstName, input.middleName, input.lastName].filter(Boolean).join(" ")})
    returning id, name, first_name, middle_name, last_name, email, balance, monthly_spend, last_active, created_at
  `) as UserRow[];
  return mapAppUser(rows[0]);
}
