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

type AppUserRow = {
  id: string;
  sequence_id: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  password_salt: string;
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

const mapAppUserToUserShape = (row: AppUserRow) => ({
  id: row.id,
  name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "),
  email: row.email,
  balance: 0,
  monthlySpend: 0,
  lastActive: row.created_at,
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

export async function lookupSupportUser(query: string) {
  const directUser = await lookupUser(query);
  if (directUser) return { user: directUser, source: "users" as const };

  const cleaned = query.trim().toLowerCase();
  const sequenceMatch = cleaned.match(/^t-(\d{1,10})$/i);
  const sequenceId = sequenceMatch ? Number(sequenceMatch[1]) : null;

  try {
    const rows = (await sql`
      select id, sequence_id, first_name, middle_name, last_name, email, password_hash, password_salt, created_at
      from app_users
      where email = ${cleaned} or id::text = ${query} ${sequenceId !== null ? sql`or sequence_id = ${sequenceId}` : sql``}
      limit 1
    `) as AppUserRow[];

    if (rows[0]) {
      return { user: mapAppUserToUserShape(rows[0]), source: "app_users" as const };
    }
    return null;
  } catch (error) {
    return null;
  }
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

const mapAppUser = (row: AppUserRow) => ({
  id: row.id,
  sequenceId: `T-${String(row.sequence_id).padStart(6, "0")}`,
  firstName: row.first_name,
  middleName: row.middle_name,
  lastName: row.last_name,
  email: row.email,
  createdAt: row.created_at
});

export async function findAppUserByEmail(email: string) {
  const rows = (await sql`
    select id, sequence_id, first_name, middle_name, last_name, email, password_hash, password_salt, created_at
    from app_users
    where email = ${email}
    limit 1
  `) as AppUserRow[];
  return rows[0] ? mapAppUser(rows[0]) : null;
}

export async function getAppUserAuth(email: string) {
  const rows = (await sql`
    select id, sequence_id, first_name, middle_name, last_name, email, password_hash, password_salt, created_at
    from app_users
    where email = ${email}
    limit 1
  `) as AppUserRow[];
  return rows[0] ?? null;
}

export async function createAppUser(input: {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
}) {
  const rows = (await sql`
    insert into app_users (first_name, middle_name, last_name, email, password_hash, password_salt)
    values (${input.firstName}, ${input.middleName}, ${input.lastName}, ${input.email}, ${input.passwordHash}, ${input.passwordSalt})
    returning id, sequence_id, first_name, middle_name, last_name, email, password_hash, password_salt, created_at
  `) as AppUserRow[];
  return mapAppUser(rows[0]);
}
