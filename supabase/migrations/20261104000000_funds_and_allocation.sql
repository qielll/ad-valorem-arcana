-- Accounts become funds (Expense Source in the spreadsheet) that live in a bank,
-- plus a per-period allocation table (Master Sheet columns I:L).

alter table account
  add column opening_balance numeric(15, 2) not null default 0,
  add column is_ledger_source boolean not null default false,  -- spending here is borrowed from savings and tracked in ledger
  add column is_fund boolean not null default false,           -- appears in account_balance
  add column bank varchar(20) check (bank in ('savings', 'spending')),
  add column feeds_account_id uuid references account(id) on delete set null; -- balance effect lands on this fund

-- Starter accounts from the spreadsheet (skipped when the name already exists).
insert into account (account_name, account_type)
select n, t from (values
  ('PSI Salary', 'income'),
  ('DBklik Salary', 'income'),
  ('Fixed Expense Funds', 'outcome'),
  ('Comfort Funds', 'outcome'),
  ('Saving Funds', 'outcome'),
  ('Repayment Funds', 'outcome'),
  ('Bank Interest', 'income'),
  ('Bank Admin Fee', 'outcome')
) as v(n, t)
where not exists (select 1 from account a where a.account_name = v.n);

update account set bank = 'spending'
  where account_name in ('PSI Salary', 'DBklik Salary', 'Bank Admin Fee');
update account set bank = 'spending', is_fund = true
  where account_name in ('Fixed Expense Funds', 'Comfort Funds', 'Repayment Funds');
update account set bank = 'savings', is_fund = true, is_ledger_source = true, opening_balance = 1620922
  where account_name = 'Saving Funds';
update account set bank = 'savings'
  where account_name = 'Bank Interest';

-- Interest lands in Saving Funds. The admin fee only exists in the spending bank,
-- so it feeds no fund (same as the sheet: it comes off salary before the split).
update account
set feeds_account_id = (select id from account where account_name = 'Saving Funds')
where account_name = 'Bank Interest';

create table allocation (
  id uuid primary key default gen_random_uuid(),
  periode_id uuid not null references periode(id) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  amount numeric(15, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (periode_id, account_id)
);

alter table allocation enable row level security;
create policy "signed-in users manage allocation" on allocation
  for all to authenticated using (true) with check (true);
