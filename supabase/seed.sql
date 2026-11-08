-- Optional starter accounts.
insert into account (account_name, account_type) values
  ('Salary', 'income'),
  ('Side income', 'income'),
  ('Cash', 'outcome'),
  ('Bank transfer', 'outcome');

-- Kategori awal: kategori sistem wajib ada untuk job bulanan dan entri ledger,
-- sisanya contoh kategori normal yang bisa dipilih pada daftar Transaction.
insert into category (name, is_system) values
  ('Auto: Interest', true),
  ('Auto: Admin fee', true),
  ('Ledger', true)
on conflict (name) do nothing;

insert into category (name) values
  ('Salary'),
  ('Food'),
  ('Transport'),
  ('Shopping'),
  ('Bills')
on conflict (name) do nothing;
