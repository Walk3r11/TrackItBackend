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
  balance numeric(14, 2),
  tags text [] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (id, user_id)
);
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid not null,
  foreign key (card_id, user_id) references cards(id, user_id) on delete cascade,
  amount numeric(14, 2) not null,
  category text,
  created_at timestamptz default now()
);
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
create index if not exists idx_transactions_user_created on transactions (user_id, created_at desc);
create index if not exists idx_transactions_card_created on transactions (card_id, created_at desc);
create index if not exists idx_tickets_user_updated on tickets (user_id, updated_at desc);