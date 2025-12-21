create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid references users(id) on delete
  set null,
    sender_type text not null check (sender_type in ('user', 'support')),
    content text not null,
    created_at timestamptz default now()
);
create index if not exists idx_ticket_messages_ticket on ticket_messages (ticket_id, created_at asc);
create index if not exists idx_ticket_messages_user on ticket_messages (user_id, created_at desc);