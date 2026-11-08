-- Pemisahan tabel account menjadi fund + account, dan normalisasi kategori.
--
-- Latar belakang (Bahasa Indonesia):
-- - Baris account selama ini mencampur tiga peran: saluran pemasukan/pengeluaran
--   (PSI Salary, Bank Admin Fee), dana anggaran / kategori belanja dari spreadsheet
--   (Fixed/Comfort/Saving/Repayment Funds), dan akun sistem untuk job bulanan.
-- - Migrasi ini memindahkan baris dana ke tabel `fund` DENGAN id yang sama persis,
--   sehingga semua referensi allocation dan transaction tetap valid sebagai fund_id
--   dan seluruh saldo tidak berubah.
-- - Kolom transaction_category (teks bebas) dinormalisasi menjadi tabel `category`;
--   transaction kini menyimpan category_id. Penanda entri otomatis yang sebelumnya
--   berupa awalan 'Auto:%' pada teks kategori menjadi kolom boolean is_auto,
--   agar index unik penjaga duplikat tetap bekerja tanpa kolom teks.
-- - View account_balance dipertahankan sebagai alias kompatibilitas dari
--   fund_balance (pembaca lama, misalnya bot di luar repo ini, tetap bisa membaca),
--   sedangkan bank_balance mempertahankan bentuk keluarannya ({savings, spending})
--   agar frontend (RpBox) tidak berubah.
--
-- Asumsi data langsung (periksa sebelum menjalankan migrasi ini di database live):
-- - opening_balance pada baris account yang BUKAN dana bernilai 0 (migrasi lama
--   hanya mengisi Saving Funds). Nilai opening pada akun non-dana akan dibuang
--   bersama kolomnya; total spending dari saldo awal akun non-dana ikut hilang.
-- - feeds_account_id hanya menunjuk ke baris dana (Bank Interest -> Saving Funds).
--   Pointer yang menunjuk ke non-dana tidak bisa dipindahkan dan menjadi null.

-- ============================================================
-- 1. Tabel category + pengisian dari nilai teks yang sudah ada
-- ============================================================

create table category (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null unique,
  is_system boolean not null default false,  -- kategori bawaan sistem: 'Auto:%' dan 'Ledger'
  created_at timestamptz not null default now()
);

alter table category enable row level security;
create policy "signed-in users manage category" on category
  for all to authenticated using (true) with check (true);

insert into category (name)
select distinct transaction_category
from transaction
where transaction_category is not null and trim(transaction_category) <> ''
on conflict (name) do nothing;

update category set is_system = true
where name like 'Auto:%' or name = 'Ledger';

-- ============================================================
-- 2. Tabel fund (salinan baris dana dari account, id dipertahankan)
-- ============================================================

create table fund (
  id uuid primary key default gen_random_uuid(),
  fund_name varchar(100) not null,
  bank varchar(20) not null check (bank in ('savings', 'spending')),
  opening_balance numeric(15, 2) not null default 0,
  is_ledger_source boolean not null default false,  -- pengeluaran dari dana ini dicatat sebagai utang di ledger
  created_at timestamptz not null default now()
);

alter table fund enable row level security;
create policy "signed-in users manage fund" on fund
  for all to authenticated using (true) with check (true);

-- Hanya boleh ada satu dana sumber ledger dalam satu waktu.
create unique index fund_single_ledger_source on fund (is_ledger_source)
  where is_ledger_source;

insert into fund (id, fund_name, bank, opening_balance, is_ledger_source, created_at)
select id, account_name, bank, opening_balance, is_ledger_source, created_at
from account
where is_fund;

-- ============================================================
-- 3. View lama diturunkan dulu (bergantung pada kolom yang akan berubah)
-- ============================================================

drop view if exists bank_balance;
drop view if exists account_balance;
drop view if exists allocation_usage;

-- ============================================================
-- 4. Transaction: tambah fund_id, category_id, is_auto
-- ============================================================

alter table transaction
  add column fund_id uuid references fund(id) on delete set null,
  add column category_id uuid references category(id) on delete set null,
  add column is_auto boolean not null default false;

-- Transaksi yang dulu menunjuk ke baris dana kini menunjuk ke fund (id sama).
update transaction
set fund_id = account_id, account_id = null
where account_id in (select id from fund);

update transaction t
set category_id = c.id
from category c
where t.transaction_category is not null and c.name = t.transaction_category;

update transaction set is_auto = true
where transaction_category like 'Auto:%';

-- Index penjaga duplikat entri otomatis, kini berbasis is_auto.
drop index if exists transaction_auto_once;
create unique index transaction_auto_once on transaction (account_id, periode_id)
  where is_auto;

alter table transaction drop column transaction_category;

-- ============================================================
-- 5. Allocation: account_id menjadi fund_id (nilai id tidak berubah)
-- ============================================================

alter table allocation
  add column fund_id uuid references fund(id) on delete cascade;

update allocation set fund_id = account_id;

alter table allocation
  drop column account_id,
  alter column fund_id set not null,
  drop constraint if exists allocation_periode_id_account_id_key,
  add constraint allocation_periode_fund_key unique (periode_id, fund_id);

-- ============================================================
-- 6. Account: buang peran dana, tambah feeds_fund_id dan is_system
-- ============================================================

alter table account
  add column feeds_fund_id uuid references fund(id) on delete set null,
  add column is_system boolean not null default false;

update account
set feeds_fund_id = feeds_account_id
where feeds_account_id in (select id from fund);

-- Akun sistem untuk job bulanan (dulu dikenali frontend dari nama / feeds).
update account set is_system = true
where account_name in ('Bank Interest', 'Bank Admin Fee');

delete from account where id in (select id from fund);

alter table account
  drop column is_fund,
  drop column is_ledger_source,
  drop column opening_balance,
  drop column feeds_account_id;

-- ============================================================
-- 7. View saldo: fund_balance (baru), account_balance (alias), bank_balance
-- ============================================================

-- Saldo per dana: opening + allocated - spent + repaid + extra_in - extra_out
-- (planned adalah komitmen yang belum dibelanjakan: balance - planned = bebas).
create view fund_balance with (security_invoker = true) as
select f.id as fund_id, f.fund_name, f.opening_balance,
  coalesce((select sum(x.amount) from allocation x where x.fund_id = f.id), 0) as allocated,
  coalesce((select sum(t.amount) from transaction t
            where t.fund_id = f.id and t.transaction_status = 'completed'), 0) as spent,
  coalesce((select sum(t.amount) from transaction t
            where t.fund_id = f.id and t.transaction_status = 'planned'), 0) as planned,
  coalesce((select sum(l.repaid_amount) from ledger l
            join transaction t on t.id = l.transaction_id
            where t.fund_id = f.id), 0) as repaid,
  coalesce((select sum(t.amount) from transaction t
            join account s on s.id = t.account_id
            where s.feeds_fund_id = f.id and s.account_type = 'income'
              and t.transaction_status = 'completed'), 0) as extra_in,
  coalesce((select sum(t.amount) from transaction t
            join account s on s.id = t.account_id
            where s.feeds_fund_id = f.id and s.account_type = 'outcome'
              and t.transaction_status = 'completed'), 0) as extra_out
from fund f;

-- Alias kompatibilitas: bentuk kolom sama seperti account_balance lama.
create view account_balance with (security_invoker = true) as
select fund_id as account_id, fund_name as account_name, opening_balance,
       allocated, spent, planned, repaid, extra_in, extra_out
from fund_balance;

-- Saldo riil tiap bank, untuk dibandingkan dengan aplikasi bank.
create view bank_balance with (security_invoker = true) as
select 'savings'::text as bank,
  (select coalesce(sum(fb.opening_balance + fb.allocated - fb.spent + fb.repaid + fb.extra_in - fb.extra_out), 0)
     from fund_balance fb
     join fund f on f.id = fb.fund_id
     where f.bank = 'savings') as balance
union all
select 'spending'::text,
  (select coalesce(sum(opening_balance), 0) from fund where bank = 'spending')
  + (select coalesce(sum(t.amount), 0) from transaction t
       join account a on a.id = t.account_id
       where a.bank = 'spending' and a.account_type = 'income'
         and t.transaction_status = 'completed')                    -- gaji masuk
  - (select coalesce(sum(t.amount), 0) from transaction t
       join fund f on f.id = t.fund_id
       where f.bank = 'spending'
         and t.transaction_status = 'completed')                    -- belanja dana bank spending
  - (select coalesce(sum(t.amount), 0) from transaction t
       join account a on a.id = t.account_id
       where a.bank = 'spending' and a.account_type = 'outcome'
         and t.transaction_status = 'completed')                    -- biaya admin bank
  - (select coalesce(sum(x.amount), 0) from allocation x
       join fund f on f.id = x.fund_id
       where f.bank = 'savings')                                    -- dipindah ke savings
  - (select coalesce(sum(repaid_amount), 0) from ledger);           -- pembayaran ledger ke savings

-- Penggunaan alokasi (planned + completed), sama seperti sebelumnya.
create view allocation_usage with (security_invoker = true) as
select x.id as allocation_id, coalesce(sum(t.amount), 0) as used
from allocation x
left join transaction t on t.periode_id = x.periode_id and t.fund_id = x.fund_id
group by x.id;

-- ============================================================
-- 8. Job bulanan: sumber ledger dan saldo kini dari fund / fund_balance,
--    kategori otomatis kini berupa category_id + is_auto.
-- ============================================================

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
  v_int_cat uuid;
  v_fee_cat uuid;
  v_month text := (array['January', 'February', 'March', 'April', 'May', 'June', 'July',
                         'August', 'September', 'October', 'November', 'December'])[extract(month from p_date)];
begin
  select * into pol from bank_policy;
  select id into v_savings from fund where fund_name = 'Saving Funds';
  select id into v_int_acc from account where account_name = 'Bank Interest';
  select id into v_fee_acc from account where account_name = 'Bank Admin Fee';

  -- Kategori sistem dipastikan ada (normalnya sudah dibuat migrasi ini).
  insert into category (name, is_system) values ('Auto: Interest', true)
    on conflict (name) do nothing;
  insert into category (name, is_system) values ('Auto: Admin fee', true)
    on conflict (name) do nothing;
  select id into v_int_cat from category where name = 'Auto: Interest';
  select id into v_fee_cat from category where name = 'Auto: Admin fee';

  select id into v_periode from periode
   where periode_month = v_month and periode_year = extract(year from p_date);
  if v_periode is null then
    insert into periode (periode_month, periode_year)
    values (v_month, extract(year from p_date))
    returning id into v_periode;
  end if;

  -- Bunga atas saldo Saving Funds, diambil sebelum entri bulan ini.
  select opening_balance + allocated - spent + repaid + extra_in - extra_out
    into v_balance from fund_balance where fund_id = v_savings;
  v_interest := round(coalesce(v_balance, 0) * pol.interest_rate_yearly / 12, 2);

  if v_interest > 0 and v_int_acc is not null then
    insert into transaction (transaction_name, amount, transaction_date,
                             transaction_status, account_id, periode_id, category_id, is_auto)
    values ('Bank interest', v_interest, p_date, 'completed', v_int_acc, v_periode, v_int_cat, true)
    on conflict do nothing;
  end if;

  if pol.admin_fee > 0 and v_fee_acc is not null then
    insert into transaction (transaction_name, amount, transaction_date,
                             transaction_status, account_id, periode_id, category_id, is_auto)
    values ('Bank admin fee', pol.admin_fee, p_date, 'completed', v_fee_acc, v_periode, v_fee_cat, true)
    on conflict do nothing;
  end if;
end $$;
