-- Finance tracker schema. Same four tables as the setup guide, with
-- gen_random_uuid() (no extension needed), sanity checks, and row level security.

create table periode (
  id uuid primary key default gen_random_uuid(),
  periode_month varchar(20) not null,
  periode_year int not null,
  created_at timestamptz not null default now(),
  unique (periode_year, periode_month)
);

create table account (
  id uuid primary key default gen_random_uuid(),
  account_name varchar(100) not null,
  account_type varchar(50) not null check (account_type in ('income', 'outcome')),
  created_at timestamptz not null default now()
);

create table transaction (
  id uuid primary key default gen_random_uuid(),
  transaction_name varchar(255) not null,
  transaction_category varchar(100) not null,
  amount numeric(15, 2) not null check (amount > 0),
  transaction_date date not null,
  transaction_status varchar(50) not null default 'completed'
    check (transaction_status in ('completed', 'pending')),
  account_id uuid references account(id) on delete set null,
  periode_id uuid references periode(id) on delete set null,
  created_at timestamptz not null default now()
);

create table ledger (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transaction(id) on delete cascade,
  repayment_status varchar(50) not null default 'pending'
    check (repayment_status in ('pending', 'paid')),
  repaid_amount numeric(15, 2) not null default 0 check (repaid_amount >= 0),
  created_at timestamptz not null default now()
);

create index transaction_periode_idx on transaction (periode_id, transaction_date desc);
create index ledger_transaction_idx on ledger (transaction_id);

-- Row level security: only signed-in users can touch data.
-- The Telegram bot uses the service role key, which bypasses RLS.
alter table periode enable row level security;
alter table account enable row level security;
alter table transaction enable row level security;
alter table ledger enable row level security;

create policy "signed-in users manage periode" on periode
  for all to authenticated using (true) with check (true);
create policy "signed-in users manage account" on account
  for all to authenticated using (true) with check (true);
create policy "signed-in users manage transaction" on transaction
  for all to authenticated using (true) with check (true);
create policy "signed-in users manage ledger" on ledger
  for all to authenticated using (true) with check (true);
