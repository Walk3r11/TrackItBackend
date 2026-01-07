import { sql } from "./db";

type Numeric = string | number | null;

type UserRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  email_verified?: boolean | null;
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

type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
};

type SavingsGoalRow = {
  user_id: string;
  goal_amount: Numeric;
  goal_period: "daily" | "weekly" | "monthly";
  created_at: string;
  updated_at: string;
};

const mapUser = (row: UserRow) => ({
  id: row.id,
  name: row.name ?? [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
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
    select id, name, first_name, last_name, email, balance, monthly_spend, last_active, created_at
    from users
    where email = ${query} or id::text = ${query}
    limit 1
  `) as UserRow[];
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function lookupSupportUser(query: string) {
  const cleaned = query.trim().toLowerCase();
  const rows = (await sql`
    select id, name, first_name, last_name, email, balance, monthly_spend, last_active, created_at
    from users
    where lower(email) = ${cleaned} or id::text = ${query}
    limit 1
  `) as UserRow[];
  return rows[0] ? { user: mapUser(rows[0]), source: "users" as const } : null;
}

export async function getUserTickets(userId: string, status?: string) {
  let rows: TicketRow[];
  if (status && status !== "all") {
    rows = (await sql`
      select id, user_id, subject, status, priority, updated_at, created_at
      from tickets
      where user_id = ${userId} and status = ${status}
      order by updated_at desc
      limit 50
    `) as TicketRow[];
  } else {
    rows = (await sql`
      select id, user_id, subject, status, priority, updated_at, created_at
      from tickets
      where user_id = ${userId}
      order by updated_at desc
      limit 50
    `) as TicketRow[];
  }
  return rows.map(mapTicket);
}

export async function getAllTickets(status?: string) {
  const whereStatus = status && status !== "all" ? sql`where status = ${status}` : sql``;
  const rows = (await sql`
    select id, user_id, subject, status, priority, updated_at, created_at
    from tickets
    ${whereStatus}
    order by updated_at desc
    limit 500
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
  lastName: row.last_name,
  email: row.email,
  createdAt: row.created_at
});

export async function findAppUserByEmail(email: string) {
  const rows = (await sql`
    select id, name, first_name, last_name, email, balance, monthly_spend, last_active, created_at
    from users
    where email = ${email}
    limit 1
  `) as UserRow[];
  return rows[0] ? mapAppUser(rows[0]) : null;
}

export async function getAppUserAuth(email: string) {
  const rows = (await sql`
    select id, name, first_name, last_name, email, email_verified, password_hash, balance, monthly_spend, last_active, created_at
    from users
    where email = ${email}
    limit 1
  `) as AppUserAuthRow[];
  return rows[0] ?? null;
}

export async function createAppUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
}) {
  const rows = (await sql`
    insert into users (first_name, last_name, email, password_hash, balance, monthly_spend, last_active, created_at, name)
    values (${input.firstName}, ${input.lastName}, ${input.email}, ${input.passwordHash}, 0, 0, now(), now(),
            ${[input.firstName, input.lastName].filter(Boolean).join(" ")})
    returning id, name, first_name, last_name, email, balance, monthly_spend, last_active, created_at
  `) as UserRow[];

  const user = mapAppUser(rows[0]);
  await sql`
    insert into savings_goals (user_id)
    values (${user.id})
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into categories (user_id, name)
    values (${user.id}, 'Uncategorized')
    on conflict (user_id, name) do nothing
  `;

  return user;
}

type SupportUserAuthRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export async function getSupportUserAuth(email: string) {
  try {
    const supportRows = (await sql`
      select id, email, password_hash, name, first_name, last_name
      from support_users
      where lower(email) = ${email.trim().toLowerCase()}
      limit 1
    `) as SupportUserAuthRow[];

    if (supportRows[0]) {
      return supportRows[0];
    }
  } catch {
  }

  const userRows = (await sql`
    select id, email, password_hash, name, first_name, last_name
    from users
    where lower(email) = ${email.trim().toLowerCase()}
      and (role = 'support' or is_support = true)
    limit 1
  `) as SupportUserAuthRow[];
  
  return userRows[0] ?? null;
}

const normalizeCategoryName = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);

const mapCategory = (row: CategoryRow) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  color: row.color ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export async function ensureUncategorizedCategory(userId: string) {
  const rows = (await sql`
    insert into categories (user_id, name)
    values (${userId}, 'Uncategorized')
    on conflict (user_id, name)
    do update set updated_at = categories.updated_at
    returning id, user_id, name, color, created_at, updated_at
  `) as CategoryRow[];
  return mapCategory(rows[0]);
}

export async function listCategories(userId: string) {
  const rows = (await sql`
    select id, user_id, name, color, created_at, updated_at
    from categories
    where user_id = ${userId}
    order by case when name = 'Uncategorized' then 0 else 1 end, name asc
  `) as CategoryRow[];
  return rows.map(mapCategory);
}

export async function getOrCreateCategoryByName(userId: string, name: string, color?: string | null) {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return ensureUncategorizedCategory(userId);

  const rows = (await sql`
    insert into categories (user_id, name, color)
    values (${userId}, ${normalized}, ${color ?? null})
    on conflict (user_id, name)
    do update set color = coalesce(${color ?? null}, categories.color),
                  updated_at = now()
    returning id, user_id, name, color, created_at, updated_at
  `) as CategoryRow[];
  return mapCategory(rows[0]);
}

export async function clearUserCategories(userId: string) {
  const defaultCategory = await ensureUncategorizedCategory(userId);

  await sql`
    update transactions
    set category_id = ${defaultCategory.id}
    where user_id = ${userId}
      and (category_id is null or category_id <> ${defaultCategory.id})
  `;

  await sql`
    delete from categories
    where user_id = ${userId}
      and id <> ${defaultCategory.id}
  `;

  return listCategories(userId);
}

export async function getSavingsGoal(userId: string) {
  const rows = (await sql`
    insert into savings_goals (user_id)
    values (${userId})
    on conflict (user_id)
    do update set updated_at = savings_goals.updated_at
    returning user_id, goal_amount, goal_period, created_at, updated_at
  `) as SavingsGoalRow[];

  const row = rows[0];
  return {
    userId: row.user_id,
    goalAmount: toNumber(row.goal_amount),
    goalPeriod: row.goal_period,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function updateSavingsGoal(input: { userId: string; goalAmount?: number | null; goalPeriod?: string }) {
  const validPeriods = new Set(["daily", "weekly", "monthly"]);
  const period = input.goalPeriod?.toLowerCase();
  const goalPeriod = period && validPeriods.has(period) ? (period as "daily" | "weekly" | "monthly") : undefined;

  const rows = (await sql`
    insert into savings_goals (user_id, goal_amount, goal_period, updated_at)
    values (
      ${input.userId},
      ${input.goalAmount ?? 0},
      ${goalPeriod ?? "monthly"},
      now()
    )
    on conflict (user_id)
    do update set goal_amount = coalesce(${input.goalAmount ?? null}, savings_goals.goal_amount),
                  goal_period = coalesce(${goalPeriod ?? null}, savings_goals.goal_period),
                  updated_at = now()
    returning user_id, goal_amount, goal_period, created_at, updated_at
  `) as SavingsGoalRow[];

  const row = rows[0];
  return {
    userId: row.user_id,
    goalAmount: toNumber(row.goal_amount),
    goalPeriod: row.goal_period,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
