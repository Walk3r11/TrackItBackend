create extension if not exists "pgcrypto";
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  name text,
  email text not null unique,
  password_hash text,
  balance numeric(14, 2) default 0,
  monthly_spend numeric(14, 2) default 0,
  last_active timestamptz default now(),
  created_at timestamptz default now()
);
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  nickname text,
  card_limit numeric(14, 2),
  daily_limit numeric(14, 2),
  weekly_limit numeric(14, 2),
  monthly_limit numeric(14, 2),
  balance numeric(14, 2),
  tags text [] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (id, user_id)
);
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);
create table if not exists savings_goals (
  user_id uuid primary key references users(id) on delete cascade,
  goal_amount numeric(14, 2) not null default 0,
  goal_period text not null default 'monthly' check (goal_period in ('daily', 'weekly', 'monthly')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid not null,
  foreign key (card_id, user_id) references cards(id, user_id) on delete cascade,
  amount numeric(14, 2) not null,
  category_id uuid references categories(id) on delete restrict,
  category text,
  created_at timestamptz default now()
);
alter table cards add column if not exists daily_limit numeric(14, 2);
alter table cards add column if not exists weekly_limit numeric(14, 2);
alter table cards add column if not exists monthly_limit numeric(14, 2);

alter table transactions add column if not exists category_id uuid;

insert into savings_goals (user_id)
select id from users
on conflict (user_id) do nothing;

insert into categories (user_id, name)
select id, 'Uncategorized' from users
on conflict (user_id, name) do nothing;
insert into categories (user_id, name)
select distinct t.user_id, t.category
from transactions t
where t.category is not null
  and t.category <> ''
on conflict (user_id, name) do nothing;
update transactions t
set category_id = c.id
from categories c
where t.category_id is null
  and t.category is not null
  and t.category <> ''
  and c.user_id = t.user_id
  and c.name = t.category;
update transactions t
set category_id = c.id
from categories c
where t.category_id is null
  and c.user_id = t.user_id
  and c.name = 'Uncategorized';

do $$
begin
  alter table transactions
    add constraint transactions_category_id_fkey
    foreign key (category_id) references categories(id) on delete restrict;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table transactions alter column category_id set not null;
exception
  when others then null;
end $$;
update cards
set monthly_limit = coalesce(monthly_limit, card_limit)
where card_limit is not null;
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  subject text not null,
  status text not null default 'open',
  priority text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_users_last_active on users (last_active desc);
create index if not exists idx_users_created_at on users (created_at desc);
create index if not exists idx_cards_user on cards (user_id);
create index if not exists idx_categories_user on categories (user_id);
create index if not exists idx_categories_user_name on categories (user_id, name);
create index if not exists idx_transactions_user_created on transactions (user_id, created_at desc);
create index if not exists idx_transactions_card_created on transactions (card_id, created_at desc);
create index if not exists idx_transactions_category_created on transactions (category_id, created_at desc);
create index if not exists idx_tickets_user_updated on tickets (user_id, updated_at desc);
