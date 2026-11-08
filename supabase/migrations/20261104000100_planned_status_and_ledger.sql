-- Planned vs unplanned transactions, a partial repayment state, and ledger rows
-- tied to the savings fund.

alter table transaction drop constraint if exists transaction_transaction_status_check;

-- Ledger spending was actually spent; any other 'pending' row becomes planned.
update transaction t set transaction_status = 'completed'
  where transaction_status = 'pending'
    and exists (select 1 from ledger l where l.transaction_id = t.id);
update transaction set transaction_status = 'planned' where transaction_status = 'pending';

alter table transaction
  add constraint transaction_status_check check (transaction_status in ('planned', 'completed')),
  add column is_planned boolean not null default false,  -- budgeted in advance; stays true once completed
  alter column transaction_category drop not null;       -- the spreadsheet has no category

-- Existing ledger transactions belong to the savings fund.
update transaction t
set account_id = (select id from account where is_ledger_source limit 1)
where t.account_id is null
  and exists (select 1 from ledger l where l.transaction_id = t.id);

alter table ledger drop constraint if exists ledger_repayment_status_check;
update ledger set repayment_status = 'partial' where repayment_status = 'pending' and repaid_amount > 0;
alter table ledger
  add constraint ledger_repayment_status_check check (repayment_status in ('pending', 'partial', 'paid'));
create unique index ledger_transaction_uniq on ledger (transaction_id);

-- Automatic entries (interest, admin fee) post at most once per account per period.
create unique index transaction_auto_once on transaction (account_id, periode_id)
  where transaction_category like 'Auto:%';
