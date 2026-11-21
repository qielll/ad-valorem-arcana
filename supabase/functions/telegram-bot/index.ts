// Bot Telegram Ad Valorem — Edge Function Supabase (Deno).
//
// Webhook Telegram -> fungsi ini -> tabel yang sama dengan aplikasi web, memakai
// service role key (melewati RLS, seperti yang sudah diantisipasi migrasi `init`).
// Alur pencatatan meniru persis formulir Transaction di web (src/lists.jsx urutan
// kolomnya, src/lib/api.js validasinya):
//   Nama -> Kategori (opsional, non-sistem) -> Sumber (account non-sistem / fund)
//   -> Status (Done/Planned) -> Tanggal -> Nominal -> Konfirmasi -> Simpan.
// Transaksi dari bot TIDAK membuat baris ledger otomatis — sama seperti simpan
// transaksi di web (entri ledger adalah alur terpisah).
//
// Keamanan (fungsi ini pada dasarnya memegang akses tulis penuh ke database):
//   1. verify_jwt harus MATI untuk fungsi ini (Telegram tidak bisa mengirim JWT
//      Supabase) — deploy dengan `--no-verify-jwt`.
//   2. Header rahasia webhook Telegram (X-Telegram-Bot-Api-Secret-Token) diperiksa.
//   3. Hanya satu user Telegram yang diizinkan (TELEGRAM_ALLOWED_USER_ID).
//
// Secrets yang dibutuhkan (supabase secrets set ...):
//   TELEGRAM_BOT_TOKEN        token dari @BotFather
//   TELEGRAM_ALLOWED_USER_ID  ID numerik user Telegram pemilik (lihat @userinfobot)
//   TELEGRAM_WEBHOOK_SECRET   string acak buatan sendiri, dipakai juga saat setWebhook
// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY tersedia otomatis di runtime Edge Function.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  fmtDateId,
  formatRupiah,
  parseAmountId,
  parseDateId,
  periodMonthName,
  periodYear,
  summaryLines,
  todayISOJakarta,
  type TxDraft,
} from "./logic.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const ALLOWED_USER_ID = Number(Deno.env.get("TELEGRAM_ALLOWED_USER_ID") ?? "0");
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

// Sesi percakapan kedaluwarsa setelah 2 jam tidak aktif.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

type Step = "name" | "category" | "source" | "status" | "date" | "amount" | "confirm" | "saving";

interface Session {
  step: Step;
  draft: TxDraft;
}

/* ---------------- Telegram API ---------------- */

interface TgButton {
  text: string;
  callback_data: string;
}
type TgKeyboard = { inline_keyboard: TgButton[][] };

async function tg(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    console.error(`Telegram ${method} gagal:`, JSON.stringify(body));
  }
  return body;
}

const send = (chatId: number, text: string, keyboard?: TgKeyboard) =>
  tg("sendMessage", {
    chat_id: chatId,
    text,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });

const answerCallback = (id: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });

const cancelButton: TgKeyboard = {
  inline_keyboard: [[{ text: "❌ Batal", callback_data: "flow:cancel" }]],
};

const menuKeyboard: TgKeyboard = {
  inline_keyboard: [
    [{ text: "➕ Catat Transaksi", callback_data: "menu:catat" }],
    [{ text: "💰 Lihat Saldo", callback_data: "menu:saldo" }],
  ],
};

/* ---------------- Sesi (tabel telegram_session) ---------------- */

async function getSession(chatId: number): Promise<Session | null> {
  const { data, error } = await supabase
    .from("telegram_session")
    .select("step, draft, updated_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error) {
    console.error("getSession:", error.message);
    return null;
  }
  if (!data) return null;
  if (Date.now() - new Date(data.updated_at as string).getTime() > SESSION_TTL_MS) {
    await clearSession(chatId);
    return null;
  }
  return { step: data.step as Step, draft: (data.draft ?? {}) as TxDraft };
}

async function setSession(chatId: number, userId: number, session: Session): Promise<void> {
  const { error } = await supabase.from("telegram_session").upsert({
    chat_id: chatId,
    user_id: userId,
    step: session.step,
    draft: session.draft,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("setSession:", error.message);
}

async function clearSession(chatId: number): Promise<void> {
  const { error } = await supabase.from("telegram_session").delete().eq("chat_id", chatId);
  if (error) console.error("clearSession:", error.message);
}

/* ---------------- Data referensi (sama seperti pilihan di web) ---------------- */

async function categoryKeyboard(): Promise<TgKeyboard> {
  const { data, error } = await supabase
    .from("category")
    .select("id, name")
    .eq("is_system", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows: TgButton[][] = (data ?? []).map((c) => [
    { text: c.name as string, callback_data: `cat:${c.id}` },
  ]);
  rows.push([{ text: "⏭️ Tanpa kategori", callback_data: "cat:none" }]);
  rows.push([{ text: "❌ Batal", callback_data: "flow:cancel" }]);
  return { inline_keyboard: rows };
}

async function sourceKeyboard(): Promise<TgKeyboard> {
  const [acc, funds] = await Promise.all([
    supabase
      .from("account")
      .select("id, account_name")
      .eq("is_system", false)
      .order("created_at", { ascending: true }),
    supabase.from("fund").select("id, fund_name").order("created_at", { ascending: true }),
  ]);
  if (acc.error) throw new Error(acc.error.message);
  if (funds.error) throw new Error(funds.error.message);
  const rows: TgButton[][] = [];
  for (const f of funds.data ?? []) {
    rows.push([{ text: `🗂️ ${f.fund_name}`, callback_data: `src:fund:${f.id}` }]);
  }
  for (const a of acc.data ?? []) {
    rows.push([{ text: `🏦 ${a.account_name}`, callback_data: `src:acc:${a.id}` }]);
  }
  rows.push([{ text: "❌ Batal", callback_data: "flow:cancel" }]);
  return { inline_keyboard: rows };
}

async function sourceName(kind: "fund" | "account", id: string): Promise<string | null> {
  const table = kind === "fund" ? "fund" : "account";
  const col = kind === "fund" ? "fund_name" : "account_name";
  const { data, error } = await supabase.from(table).select(col).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return (data as unknown as Record<string, string>)[col] ?? null;
}

/* ---------------- Saldo ---------------- */

function fundBalanceOf(b: Record<string, number>): number {
  return (
    Number(b.opening_balance) + Number(b.allocated) - Number(b.spent) +
    Number(b.repaid) + Number(b.extra_in) - Number(b.extra_out)
  );
}

async function balancesText(): Promise<string> {
  const [banks, funds] = await Promise.all([
    supabase.from("bank_balance").select("bank, balance"),
    supabase.from("fund_balance").select("*"),
  ]);
  if (banks.error) throw new Error(banks.error.message);
  if (funds.error) throw new Error(funds.error.message);
  const bankMap = new Map((banks.data ?? []).map((b) => [b.bank as string, Number(b.balance)]));
  const lines = [
    "💰 Saldo bank:",
    `• Spending: ${formatRupiah(bankMap.get("spending") ?? 0)}`,
    `• Savings: ${formatRupiah(bankMap.get("savings") ?? 0)}`,
    "",
    "🗂️ Saldo dana:",
  ];
  for (const f of funds.data ?? []) {
    const rec = f as unknown as Record<string, number> & { fund_name: string };
    const balance = fundBalanceOf(rec);
    const free = balance - Number(rec.planned);
    lines.push(`• ${rec.fund_name}: ${formatRupiah(balance)} (bebas ${formatRupiah(free)})`);
  }
  return lines.join("\n");
}

async function fundBalanceText(fundId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("fund_balance")
    .select("*")
    .eq("fund_id", fundId)
    .maybeSingle();
  if (error || !data) return null;
  const rec = data as unknown as Record<string, number> & { fund_name: string };
  const balance = fundBalanceOf(rec);
  const free = balance - Number(rec.planned);
  return `Saldo ${rec.fund_name} sekarang: ${formatRupiah(balance)} (bebas ${formatRupiah(free)})`;
}

/* ---------------- Simpan transaksi (port dari saveTransaction di web) ---------------- */

async function ensurePeriodId(iso: string): Promise<string> {
  const month = periodMonthName(iso);
  const year = periodYear(iso);
  const found = await supabase
    .from("periode")
    .select("id")
    .eq("periode_month", month)
    .eq("periode_year", year)
    .limit(1)
    .maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (found.data) return found.data.id as string;
  const created = await supabase
    .from("periode")
    .insert({ periode_month: month, periode_year: year })
    .select("id")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data.id as string;
}

async function insertTransaction(d: TxDraft): Promise<string> {
  // Validasi yang sama dengan web: nama wajib, sumber wajib, nominal > 0, tanggal valid.
  if (!d.name?.trim()) throw new Error("Nama transaksi kosong.");
  if (!d.sourceId || !d.sourceKind) throw new Error("Sumber dana belum dipilih.");
  if (d.amount === undefined || !(d.amount > 0)) throw new Error("Nominal harus lebih dari 0.");
  if (!d.date) throw new Error("Tanggal belum diisi.");

  const row = {
    transaction_name: d.name.trim(),
    category_id: d.categoryId ?? null,
    amount: d.amount,
    transaction_date: d.date,
    account_id: d.sourceKind === "account" ? d.sourceId : null,
    fund_id: d.sourceKind === "fund" ? d.sourceId : null,
    periode_id: await ensurePeriodId(d.date),
    transaction_status: d.status === "planned" ? "planned" : "completed",
    is_planned: d.status === "planned",
  };
  const { data, error } = await supabase.from("transaction").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/* ---------------- Alur percakapan ---------------- */

async function startFlow(chatId: number, userId: number): Promise<void> {
  await setSession(chatId, userId, { step: "name", draft: {} });
  await send(chatId, "➕ Catat transaksi baru.\n\nNama transaksinya apa?\n(contoh: Makan siang)", cancelButton);
}

async function askCategory(chatId: number, userId: number, draft: TxDraft): Promise<void> {
  await setSession(chatId, userId, { step: "category", draft });
  await send(chatId, "Pilih kategori:", await categoryKeyboard());
}

async function askSource(chatId: number, userId: number, draft: TxDraft): Promise<void> {
  await setSession(chatId, userId, { step: "source", draft });
  await send(chatId, "Uangnya dari mana? (fund atau account)", await sourceKeyboard());
}

async function askStatus(chatId: number, userId: number, draft: TxDraft): Promise<void> {
  await setSession(chatId, userId, { step: "status", draft });
  await send(chatId, "Status transaksi:", {
    inline_keyboard: [
      [{ text: "✅ Done — sudah terjadi", callback_data: "st:completed" }],
      [{ text: "🕓 Planned — direncanakan", callback_data: "st:planned" }],
      [{ text: "❌ Batal", callback_data: "flow:cancel" }],
    ],
  });
}

async function askDate(chatId: number, userId: number, draft: TxDraft): Promise<void> {
  await setSession(chatId, userId, { step: "date", draft });
  await send(
    chatId,
    `Tanggal transaksi? Ketik tanggal (contoh: ${fmtDateId(todayISOJakarta())}, 21/11/2026, atau 2026-11-21), atau tap:`,
    {
      inline_keyboard: [
        [{ text: "📅 Hari ini", callback_data: "dt:today" }],
        [{ text: "⏪ Kemarin", callback_data: "dt:yesterday" }],
        [{ text: "❌ Batal", callback_data: "flow:cancel" }],
      ],
    },
  );
}

async function askAmount(chatId: number, userId: number, draft: TxDraft): Promise<void> {
  await setSession(chatId, userId, { step: "amount", draft });
  await send(chatId, "Berapa nominalnya?\n(contoh: 25000, 25.000, 25rb, 1,5jt)", cancelButton);
}

async function askConfirm(chatId: number, userId: number, draft: TxDraft): Promise<void> {
  await setSession(chatId, userId, { step: "confirm", draft });
  await send(chatId, `Periksa dulu sebelum disimpan:\n\n${summaryLines(draft).join("\n")}`, {
    inline_keyboard: [
      [{ text: "✅ Simpan", callback_data: "cf:save" }],
      [{ text: "❌ Batal", callback_data: "cf:cancel" }],
    ],
  });
}

async function doSave(chatId: number, userId: number, session: Session): Promise<void> {
  // Kunci sesi lebih dulu supaya tap ganda / pengiriman ulang webhook tidak dobel.
  await setSession(chatId, userId, { step: "saving", draft: session.draft });
  try {
    const txId = await insertTransaction(session.draft);
    await clearSession(chatId);
    let text = `✅ Tersimpan!\n\n${summaryLines(session.draft).join("\n")}`;
    if (session.draft.sourceKind === "fund" && session.draft.sourceId) {
      const bal = await fundBalanceText(session.draft.sourceId);
      if (bal) text += `\n\n${bal}`;
    }
    await send(chatId, text, {
      inline_keyboard: [
        [{ text: "↩️ Undo (hapus transaksi ini)", callback_data: `undo:${txId}` }],
        [{ text: "➕ Catat lagi", callback_data: "menu:catat" }],
        [{ text: "💰 Lihat Saldo", callback_data: "menu:saldo" }],
      ],
    });
  } catch (e) {
    // Gagal simpan: kembalikan ke langkah konfirmasi supaya bisa dicoba lagi.
    await setSession(chatId, userId, { step: "confirm", draft: session.draft });
    await send(chatId, `⚠️ Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}\nDraft tidak hilang — tap Simpan untuk mencoba lagi, atau Batal.`, {
      inline_keyboard: [
        [{ text: "✅ Simpan", callback_data: "cf:save" }],
        [{ text: "❌ Batal", callback_data: "cf:cancel" }],
      ],
    });
  }
}

/* ---------------- Penanganan update Telegram ---------------- */

interface TgUser { id: number }
interface TgChat { id: number }
interface TgMessage { chat: TgChat; from?: TgUser; text?: string }
interface TgCallback { id: string; from: TgUser; message?: TgMessage; data?: string }
interface TgUpdate { message?: TgMessage; callback_query?: TgCallback }

function isAllowed(userId: number): boolean {
  return ALLOWED_USER_ID > 0 && userId === ALLOWED_USER_ID;
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id ?? 0;
  const text = (msg.text ?? "").trim();

  if (!isAllowed(userId)) {
    await send(
      chatId,
      `⛔ Bot ini privat dan ID Telegram kamu (${userId}) tidak ada di daftar izin.`,
    );
    return;
  }

  // Perintah selalu tersedia, juga di tengah alur.
  if (text === "/start" || text === "/menu") {
    await send(chatId, "Halo! Aku bot pencatat Ad Valorem. Mau apa?", menuKeyboard);
    return;
  }
  if (text === "/catat") return startFlow(chatId, userId);
  if (text === "/saldo") {
    await send(chatId, await balancesText(), menuKeyboard);
    return;
  }
  if (text === "/batal") {
    await clearSession(chatId);
    await send(chatId, "Alur dibatalkan.", menuKeyboard);
    return;
  }
  if (text === "/help") {
    await send(
      chatId,
      "Perintah:\n/catat — catat transaksi baru\n/saldo — lihat saldo bank & dana\n/batal — batalkan alur yang sedang berjalan\n\nSaat diminta nominal, format seperti 25.000, 25rb, atau 1,5jt diterima. Saat diminta tanggal, contoh: 21 Nov 2026, 21/11/2026, 2026-11-21.",
      menuKeyboard,
    );
    return;
  }

  const session = await getSession(chatId);
  if (!session) {
    await send(chatId, "Tidak ada alur yang berjalan. Tap Catat Transaksi untuk mulai.", menuKeyboard);
    return;
  }

  switch (session.step) {
    case "name": {
      if (!text) {
        await send(chatId, "Nama tidak boleh kosong. Nama transaksinya apa?", cancelButton);
        return;
      }
      session.draft.name = text;
      await askCategory(chatId, userId, session.draft);
      return;
    }
    case "date": {
      const iso = parseDateId(text);
      if (!iso) {
        await send(chatId, "Format tanggalnya belum dikenali. Contoh: 21 Nov 2026, 21/11/2026, atau 2026-11-21.", cancelButton);
        return;
      }
      session.draft.date = iso;
      await askAmount(chatId, userId, session.draft);
      return;
    }
    case "amount": {
      const amount = parseAmountId(text);
      if (amount === null || amount <= 0) {
        await send(chatId, "Nominalnya belum valid — harus angka lebih dari 0. Contoh: 25000, 25.000, 25rb, 1,5jt.", cancelButton);
        return;
      }
      session.draft.amount = amount;
      await askConfirm(chatId, userId, session.draft);
      return;
    }
    case "category":
    case "source":
    case "status": {
      await send(chatId, "Tap salah satu tombol di atas ya — atau /batal untuk berhenti.", cancelButton);
      return;
    }
    case "confirm": {
      await send(chatId, "Tap ✅ Simpan untuk menyimpan, atau ❌ Batal.");
      return;
    }
    case "saving": {
      await send(chatId, "Sedang menyimpan, tunggu sebentar…");
      return;
    }
  }
}

async function handleCallback(cb: TgCallback): Promise<void> {
  const chatId = cb.message?.chat.id;
  const userId = cb.from.id;
  const data = cb.data ?? "";
  if (!chatId) return;

  if (!isAllowed(userId)) {
    await answerCallback(cb.id, "Tidak diizinkan.");
    return;
  }
  await answerCallback(cb.id);

  if (data === "menu:catat") return startFlow(chatId, userId);
  if (data === "menu:saldo") {
    await send(chatId, await balancesText(), menuKeyboard);
    return;
  }
  if (data === "flow:cancel" || data === "cf:cancel") {
    await clearSession(chatId);
    await send(chatId, "Dibatalkan.", menuKeyboard);
    return;
  }
  if (data.startsWith("undo:")) {
    const txId = data.slice("undo:".length);
    const { error } = await supabase.from("transaction").delete().eq("id", txId);
    await send(
      chatId,
      error ? `⚠️ Gagal menghapus: ${error.message}` : "↩️ Transaksi sudah dihapus (undo berhasil).",
      menuKeyboard,
    );
    return;
  }

  const session = await getSession(chatId);
  if (!session) {
    await send(chatId, "Sesi sudah kedaluwarsa. Mulai lagi yuk.", menuKeyboard);
    return;
  }

  if (data.startsWith("cat:") && session.step === "category") {
    const id = data.slice("cat:".length);
    if (id === "none") {
      session.draft.categoryId = null;
      session.draft.categoryName = null;
    } else {
      const { data: cat, error } = await supabase
        .from("category")
        .select("id, name")
        .eq("id", id)
        .maybeSingle();
      if (error || !cat) {
        await send(chatId, "Kategori tidak ditemukan. Coba lagi.", await categoryKeyboard());
        return;
      }
      session.draft.categoryId = cat.id as string;
      session.draft.categoryName = cat.name as string;
    }
    await askSource(chatId, userId, session.draft);
    return;
  }

  if (data.startsWith("src:") && session.step === "source") {
    const [, kind, id] = data.split(":");
    if ((kind !== "fund" && kind !== "acc") || !id) return;
    const name = await sourceName(kind === "fund" ? "fund" : "account", id);
    if (!name) {
      await send(chatId, "Sumber tidak ditemukan. Coba lagi.", await sourceKeyboard());
      return;
    }
    session.draft.sourceKind = kind === "fund" ? "fund" : "account";
    session.draft.sourceId = id;
    session.draft.sourceName = name;
    await askStatus(chatId, userId, session.draft);
    return;
  }

  if (data.startsWith("st:") && session.step === "status") {
    session.draft.status = data === "st:planned" ? "planned" : "completed";
    await askDate(chatId, userId, session.draft);
    return;
  }

  if (data.startsWith("dt:") && session.step === "date") {
    session.draft.date = data === "dt:yesterday" ? todayISOJakarta(-1) : todayISOJakarta(0);
    await askAmount(chatId, userId, session.draft);
    return;
  }

  if (data === "cf:save" && session.step === "confirm") {
    await doSave(chatId, userId, session);
    return;
  }
}

/* ---------------- Entry point ---------------- */

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Ad Valorem Telegram bot — webhook aktif.", { status: 200 });
  }
  if (!BOT_TOKEN || !ALLOWED_USER_ID) {
    console.error("Secrets TELEGRAM_BOT_TOKEN / TELEGRAM_ALLOWED_USER_ID belum di-set.");
    return new Response("Konfigurasi bot belum lengkap.", { status: 500 });
  }
  if (WEBHOOK_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
  } catch (e) {
    // Tetap balas 200 supaya Telegram tidak mengulang pengiriman tanpa henti;
    // error dicatat di log fungsi.
    console.error("handleUpdate:", e);
  }
  return new Response("ok", { status: 200 });
});
