-- Fund balances and real bank balances.

-- Per fund: balance = opening_balance + allocated - spent + repaid + extra_in - extra_out
-- (planned is committed but not yet spent: balance - planned is what is really free).
create view account_balance with (security_invoker = true) as
select a.id as account_id, a.account_name, a.opening_balance,
  coalesce((select sum(x.amount) from allocation x where x.account_id = a.id), 0) as allocated,
  coalesce((select sum(t.amount) from transaction t
            where t.account_id = a.id and t.transaction_status = 'completed'), 0) as spent,
  coalesce((select sum(t.amount) from transaction t
            where t.account_id = a.id and t.transaction_status = 'planned'), 0) as planned,
  coalesce((select sum(l.repaid_amount) from ledger l
            join transaction t on t.id = l.transaction_id
            where t.account_id = a.id), 0) as repaid,
  coalesce((select sum(t.amount) from transaction t
            join account s on s.id = t.account_id
            where s.feeds_account_id = a.id and s.account_type = 'income'
              and t.transaction_status = 'completed'), 0) as extra_in,
  coalesce((select sum(t.amount) from transaction t
            join account s on s.id = t.account_id
            where s.feeds_account_id = a.id and s.account_type = 'outcome'
              and t.transaction_status = 'completed'), 0) as extra_out
from account a
where a.is_fund;

-- Real balance of each bank, to compare with the bank apps.
create view bank_balance with (security_invoker = true) as
select 'savings'::text as bank,
  (select coalesce(sum(ab.opening_balance + ab.allocated - ab.spent + ab.repaid + ab.extra_in - ab.extra_out), 0)
     from account_balance ab
     join account a on a.id = ab.account_id
     where a.bank = 'savings') as balance
union all
select 'spending'::text,
  (select coalesce(sum(opening_balance), 0) from account where bank = 'spending')
  + (select coalesce(sum(t.amount), 0) from transaction t
       join account a on a.id = t.account_id
       where a.bank = 'spending' and a.account_type = 'income'
         and t.transaction_status = 'completed')                    -- salary in
  - (select coalesce(sum(t.amount), 0) from transaction t
       join account a on a.id = t.account_id
       where a.bank = 'spending' and a.account_type = 'outcome'
         and t.transaction_status = 'completed')                    -- fund spending and admin fee
  - (select coalesce(sum(x.amount), 0) from allocation x
       join account a on a.id = x.account_id
       where a.bank = 'savings')                                    -- moved to savings
  - (select coalesce(sum(repaid_amount), 0) from ledger);           -- repayments sent to savings
