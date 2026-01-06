create table if not exists chat_history (
  user_id uuid not null references users(id) on delete cascade,
  chat_id uuid not null default gen_random_uuid(),
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  primary key (user_id, chat_id)
);
create index if not exists idx_chat_history_user on chat_history (user_id);
create index if not exists idx_chat_history_user_chat on chat_history (user_id, chat_id);
create index if not exists idx_chat_history_updated on chat_history (updated_at desc);