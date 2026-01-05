create table if not exists chat_history (
  user_id uuid primary key references users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists idx_chat_history_user on chat_history (user_id);
create index if not exists idx_chat_history_updated on chat_history (updated_at desc);