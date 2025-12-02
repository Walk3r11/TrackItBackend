-- random fake emails to test the tables

insert into users (name, email, balance, monthly_spend, last_active)
values
  ('Amelia Carter', 'amelia@swiftbank.app', 15420.50, 820.30, now() - interval '1 day'),
  ('Rafael Silva', 'rafael@swiftbank.app', 9820.10, 640.00, now() - interval '2 days'),
  ('Lena Kovacs', 'lena@swiftbank.app', 22310.00, 1200.75, now() - interval '5 days'),
  ('Noah Lee', 'noah@swiftbank.app', 11450.90, 540.25, now() - interval '12 hours'),
  ('Priya Desai', 'priya@swiftbank.app', 17680.40, 930.10, now() - interval '3 days')
on conflict (email) do update
set balance = excluded.balance,
    monthly_spend = excluded.monthly_spend,
    last_active = excluded.last_active;

insert into transactions (user_id, amount, category, created_at)
select id, amount, category, created_at from (
  values
    ((select id from users where email = 'amelia@swiftbank.app'), 120.50, 'groceries', now() - interval '2 days'),
    ((select id from users where email = 'amelia@swiftbank.app'), 240.00, 'travel', now() - interval '1 month'),
    ((select id from users where email = 'rafael@swiftbank.app'), 85.20, 'subscriptions', now() - interval '5 days'),
    ((select id from users where email = 'lena@swiftbank.app'), 400.00, 'rent', now() - interval '7 days'),
    ((select id from users where email = 'noah@swiftbank.app'), 60.00, 'food', now() - interval '3 days')
) as t(user_id, amount, category, created_at)
where user_id is not null;

insert into tickets (user_id, subject, status, priority, updated_at)
select id, subject, status, priority, updated_at from (
  values
    ((select id from users where email = 'amelia@swiftbank.app'), 'Card not working abroad', 'open', 'high', now() - interval '2 hours'),
    ((select id from users where email = 'rafael@swiftbank.app'), 'Refund request', 'pending', 'medium', now() - interval '1 day'),
    ((select id from users where email = 'lena@swiftbank.app'), 'App login issue', 'closed', 'low', now() - interval '3 days')
) as t(user_id, subject, status, priority, updated_at)
where user_id is not null;

-- sample app user (password: trackit123)
do $$
declare
  salt text := encode(gen_random_bytes(16), 'hex');
  hashed text := encode(digest('trackit123' || salt, 'sha512'), 'hex');
begin
  insert into app_users (first_name, middle_name, last_name, email, password_hash, password_salt)
  values ('Sample', 'User', 'One', 'sample@swiftbank.app', hashed, salt)
  on conflict (email) do nothing;
end $$;
