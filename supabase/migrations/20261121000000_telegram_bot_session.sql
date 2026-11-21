-- Sesi percakapan bot Telegram (Edge Function `telegram-bot`).
--
-- Bot berjalan sebagai webhook tanpa state, jadi langkah alur pencatatan yang
-- sedang berjalan (nama -> kategori -> sumber -> status -> tanggal -> nominal
-- -> konfirmasi) dan drafnya disimpan di tabel ini, satu baris per chat.
--
-- Keamanan: RLS aktif TANPA policy. Satu-satunya pengakses adalah Edge Function
-- dengan service role key (melewati RLS); client web (anon/authenticated) tidak
-- bisa membaca maupun menulis tabel ini sama sekali.

create table telegram_session (
  chat_id bigint primary key,               -- ID chat Telegram (untuk DM = sama dengan user id)
  user_id bigint not null,                  -- ID user Telegram pemilik sesi
  step text not null default 'name'
    check (step in ('name', 'category', 'source', 'status', 'date', 'amount', 'confirm', 'saving')),
  draft jsonb not null default '{}'::jsonb, -- draf transaksi yang sedang dikumpulkan
  updated_at timestamptz not null default now()
);

alter table telegram_session enable row level security;

comment on table telegram_session is
  'State alur percakapan bot Telegram Ad Valorem. Hanya diakses Edge Function telegram-bot via service role.';
