-- Automatic month-end entries: interest on the savings bank and the admin fee of the
-- spending bank. Rate and fee live in bank_policy so they can change without code.

create table bank_policy (
  id int primary key default 1 check (id = 1),
  admin_fee numeric(15, 2) not null default 10000,
  interest_rate_yearly numeric(6, 4) not null default 0.06  -- 0.06 = 6% per year
);
insert into bank_policy default values;

alter table bank_policy enable row level security;
create policy "signed-in users manage bank_policy" on bank_policy
  for all to authenticated using (true) with check (true);

create or replace function run_monthly_bank_entries(
  p_date date default (now() at time zone 'Asia/Jakarta')::date
) returns void language plpgsql as $$
declare
  pol bank_policy%rowtype;
  v_periode uuid;
  v_balance numeric;
  v_interest numeric;
  v_savings uuid;
  v_int_acc uuid;
  v_fee_acc uuid;
  v_month text := (array['January', 'February', 'March', 'April', 'May', 'June', 'July',
                         'August', 'September', 'October', 'November', 'December'])[extract(month from p_date)];
begin
  select * into pol from bank_policy;
  select id into v_savings from account where account_name = 'Saving Funds';
  select id into v_int_acc from account where account_name = 'Bank Interest';
  select id into v_fee_acc from account where account_name = 'Bank Admin Fee';

  select id into v_periode from periode
   where periode_month = v_month and periode_year = extract(year from p_date);
  if v_periode is null then
    insert into periode (periode_month, periode_year)
    values (v_month, extract(year from p_date))
    returning id into v_periode;
  end if;

  -- Interest on the Saving Funds balance, taken before this month's entries.
  select opening_balance + allocated - spent + repaid + extra_in - extra_out
    into v_balance from account_balance where account_id = v_savings;
  v_interest := round(coalesce(v_balance, 0) * pol.interest_rate_yearly / 12, 2);

  if v_interest > 0 and v_int_acc is not null then
    insert into transaction (transaction_name, transaction_category, amount, transaction_date,
                             transaction_status, account_id, periode_id)
    values ('Bank interest', 'Auto: Interest', v_interest, p_date, 'completed', v_int_acc, v_periode)
    on conflict do nothing;
  end if;

  if pol.admin_fee > 0 and v_fee_acc is not null then
    insert into transaction (transaction_name, transaction_category, amount, transaction_date,
                             transaction_status, account_id, periode_id)
    values ('Bank admin fee', 'Auto: Admin fee', pol.admin_fee, p_date, 'completed', v_fee_acc, v_periode)
    on conflict do nothing;
  end if;
end $$;

-- Runs on the last day of each month at 23:00 Jakarta time (16:00 UTC).
-- Needs pg_cron (Supabase: Database > Extensions). The cron fires on days 28-31 and the
-- WHERE clause lets it through only when tomorrow is the 1st.
create extension if not exists pg_cron;

select cron.schedule('monthly-bank-entries', '0 16 28-31 * *', $$
  select run_monthly_bank_entries()
  where ((now() at time zone 'Asia/Jakarta')::date + 1)
      = date_trunc('month', (now() at time zone 'Asia/Jakarta')::date + 1)::date
$$);
