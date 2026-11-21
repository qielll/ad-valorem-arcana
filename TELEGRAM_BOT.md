# Bot Telegram Ad Valorem

Bot Telegram pribadi untuk mencatat transaksi Ad Valorem langsung dari chat,
tanpa membuka aplikasi web. Bot memanggil **Supabase Edge Function**
(`supabase/functions/telegram-bot/`) sebagai webhook, dan fungsi itu menulis ke
tabel yang sama dengan aplikasi web memakai *service role key*.

Alur pencatatannya meniru persis formulir **Transaction** di web:

```
Nama -> Kategori (opsional) -> Sumber (fund / account) -> Status -> Tanggal -> Nominal -> Konfirmasi -> Tersimpan
```

Setelah tersimpan, bot membalas ringkasan + saldo fund yang dipakai, dan ada
tombol **Undo** untuk menghapus transaksi yang baru saja dibuat.

Perintah yang tersedia:

| Perintah | Fungsi |
|---|---|
| `/start` | Tampilkan menu (Catat Transaksi / Lihat Saldo) |
| `/catat` | Mulai alur pencatatan |
| `/saldo` | Saldo bank (Spending/Savings) dan saldo semua fund |
| `/batal` | Batalkan alur yang sedang berjalan |
| `/help` | Bantuan format nominal & tanggal |

Format yang diterima bot (disesuaikan untuk Indonesia — parser web sedikit berbeda):

- **Nominal:** `25000`, `25.000`, `1.250.000`, `25,5`, `25rb`, `150ribu`, `1,5jt`
- **Tanggal:** `21 Nov 2026`, `21 Oktober 2026`, `21/11/2026`, `2026-11-21`, atau tombol Hari ini / Kemarin

Catatan perilaku (sama seperti web):

- Kategori dan account **sistem** (`Auto:*`, `Ledger`, Bank Interest, Bank Admin Fee) tidak ditawarkan — itu diisi job bulanan.
- Transaksi berstatus **Planned** otomatis `is_planned = true`.
- Baris `periode` dibuat otomatis dari tanggal transaksi bila belum ada (nama bulan Inggris, mengikuti web).
- Menyimpan transaksi lewat bot **tidak** membuat baris ledger — sama seperti simpan transaksi di web. Entri ledger tetap alur terpisah.

---

## Keamanan

Fungsi ini memegang akses tulis penuh ke database (service role melewati RLS),
jadi tiga lapis penjaga dipakai:

1. **Webhook secret** — Telegram mengirim header `X-Telegram-Bot-Api-Secret-Token`; fungsi menolak (401) bila tidak cocok dengan `TELEGRAM_WEBHOOK_SECRET`.
2. **Allowlist user** — hanya `TELEGRAM_ALLOWED_USER_ID` yang dilayani. User lain dibalas dengan pesan penolakan (yang menyebutkan ID mereka sendiri, untuk membantu setup).
3. **Tabel sesi tertutup** — `telegram_session` memakai RLS tanpa policy; hanya service role yang bisa mengaksesnya.

Token bot dan semua secret **tidak boleh** masuk repo — semuanya diatur lewat `supabase secrets set`.

---

## Langkah Aktivasi (satu kali, di mesin kamu)

### 1. Jalankan migrasi tabel sesi

Terapkan `supabase/migrations/20261121000000_telegram_bot_session.sql` ke
database live — tempel isinya di **SQL Editor** Supabase, atau `supabase db push`
bila memakai CLI. (Migrasi ini hanya menambah tabel baru; tidak mengubah tabel lain.)

### 2. Buat bot di BotFather

1. Chat ke [@BotFather](https://t.me/BotFather) -> `/newbot` -> ikuti prompt (nama + username bot).
2. Simpan **token** yang diberikan (bentuknya `123456789:AA...`). Jangan bagikan ke siapa pun.

### 3. Cari ID Telegram kamu

Chat ke [@userinfobot](https://t.me/userinfobot) — balasannya berisi ID numerik kamu.

### 4. Deploy Edge Function

Dari folder repo (Supabase CLI, sudah `supabase link` ke project):

```bash
supabase functions deploy telegram-bot --no-verify-jwt
```

Flag `--no-verify-jwt` **wajib**: Telegram tidak bisa mengirim JWT Supabase,
jadi verifikasi JWT bawaan harus mati untuk fungsi ini (keamanan digantikan
webhook secret + allowlist di atas).

### 5. Set secrets

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<token dari BotFather>
supabase secrets set TELEGRAM_ALLOWED_USER_ID=<ID numerik kamu>
supabase secrets set TELEGRAM_WEBHOOK_SECRET=<string acak buatan sendiri, mis. hasil `openssl rand -hex 16`>
```

`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` tidak perlu di-set — tersedia
otomatis di runtime Edge Function.

### 6. Daftarkan webhook ke Telegram

Ganti `<TOKEN>`, `<PROJECT_REF>`, dan `<SECRET>`:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-bot" \
  -d "secret_token=<SECRET>"
```

Balasan harus `{"ok":true,"result":true,"description":"Webhook was set"}`.
Periksa kapan pun dengan `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`.

> Bila token yang sama pernah dipakai bot/proses lain dengan metode polling
> (`getUpdates`), webhook ini menggantikannya — satu token hanya bisa punya
> satu cara menerima update.

### 7. Uji coba

1. Chat ke bot kamu -> `/start` -> menu muncul.
2. `/saldo` -> saldo bank dan fund tampil, cocok dengan web.
3. `/catat` -> jalankan satu alur penuh dengan nominal kecil -> cek transaksi muncul di aplikasi web.
4. Tap **Undo** -> transaksi terhapus.
5. (Opsional) Chat dari akun Telegram lain -> harus ditolak.

---

## Pemecahan Masalah

| Gejala | Penyebab paling mungkin |
|---|---|
| Bot diam total | Webhook belum terdaftar (langkah 6), atau URL salah. Cek `getWebhookInfo` — kolom `last_error_message` memberi petunjuk. |
| Balasan 401 di log fungsi | `secret_token` saat setWebhook tidak sama dengan `TELEGRAM_WEBHOOK_SECRET`. Samakan, lalu setWebhook ulang. |
| Semua chat ditolak | `TELEGRAM_ALLOWED_USER_ID` salah. Bandingkan dengan ID dari @userinfobot (bot juga menyebutkan ID pengirim pada pesan penolakan). |
| Error menyebut `telegram_session` | Migrasi langkah 1 belum diterapkan di database live. |
| Fungsi tidak ditemukan / 404 | Deploy belum dilakukan atau nama fungsi bukan `telegram-bot`. |
| Alur terasa mulai dari awal lagi | Sesi kedaluwarsa setelah 2 jam tidak aktif — memang begitu. Mulai lagi dengan `/catat`. |

Log fungsi bisa dilihat di Dashboard Supabase -> Edge Functions -> `telegram-bot` -> Logs.

## Batasan v1

- Hanya **membuat** transaksi. Edit/hapus transaksi lama tetap lewat web (Undo hanya untuk transaksi yang baru dibuat di sesi chat yang sama).
- Tidak ada entri ledger dan tidak ada mode satu baris (quick entry) — itu kandidat v2.
- Satu pengguna saja (allowlist satu ID).
