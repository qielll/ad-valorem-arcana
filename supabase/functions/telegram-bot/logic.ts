// Logika murni bot Telegram Ad Valorem: parsing nominal & tanggal, dan format teks.
// Sengaja dipisah dari index.ts (tanpa akses jaringan/database) supaya bisa diuji sendiri.
// Aturan validasi meniru versi web (src/lib/api.js + src/lib/format.js), dengan dua
// penyesuaian untuk konteks chat Indonesia:
//   1. Nominal menerima format Indonesia: "25.000", "25rb", "1,5jt", "1.250.000,50".
//      (Parser web memperlakukan titik sebagai desimal, jadi "25.000" di web = 25.)
//   2. Tanggal menerima nama bulan Indonesia ("21 Okt 2026") dan format "21/11/2026",
//      selain format web ("2026-11-21" dan "21 Nov 2026").

export const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const SHORT_EN = MONTHS_EN.map((m) => m.slice(0, 3));

const pad = (n: number) => String(n).padStart(2, "0");

/** Indeks bulan (0-based) dari nama Inggris/Indonesia, pencocokan awalan 3 huruf. -1 bila tak dikenal. */
export function monthIndex(name: string): number {
  const n = name.trim().toLowerCase();
  if (n.length < 3) return -1;
  const key = n.slice(0, 3);
  const en = MONTHS_EN.findIndex((m) => m.toLowerCase().startsWith(key));
  if (en >= 0) return en;
  return MONTHS_ID.findIndex((m) => m.toLowerCase().startsWith(key));
}

/** Nama bulan Inggris untuk sebuah tanggal ISO — tabel `periode` menyimpan nama Inggris (mengikuti web). */
export function periodMonthName(iso: string): string {
  const m = Number(iso.split("-")[1]);
  return MONTHS_EN[m - 1];
}

export function periodYear(iso: string): number {
  return Number(iso.split("-")[0]);
}

/** Tanggal hari ini (atau digeser `offsetDays`) di zona waktu Asia/Jakarta, format ISO. */
export function todayISOJakarta(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toISO(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  const ok = t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  return ok ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/**
 * Parse tanggal dari teks chat. Menerima:
 *   "hari ini" / "today", "kemarin" / "yesterday",
 *   "2026-11-21", "21/11/2026", "21-11-2026", "21 Nov 2026", "21 Oktober 2026".
 * Mengembalikan ISO ("2026-11-21") atau null bila tidak valid.
 */
export function parseDateId(text: string): string | null {
  const t = String(text ?? "").trim();
  const low = t.toLowerCase();
  if (low === "hari ini" || low === "today") return todayISOJakarta(0);
  if (low === "kemarin" || low === "yesterday") return todayISOJakarta(-1);

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return toISO(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return toISO(+m[3], +m[2], +m[1]);

  m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(t);
  if (m && monthIndex(m[2]) >= 0) return toISO(+m[3], monthIndex(m[2]) + 1, +m[1]);

  return null;
}

/** "2026-11-21" -> "21 Nov 2026" (tampilan sama seperti web). */
export function fmtDateId(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${SHORT_EN[m - 1]} ${y}`;
}

/**
 * Parse nominal gaya Indonesia. Menerima:
 *   "25000", "25.000", "1.250.000", "25,5" (desimal koma), "1.250.000,50",
 *   akhiran "rb"/"ribu"/"k" (x1.000) dan "jt"/"juta" (x1.000.000): "25rb", "1,5jt".
 * Mengembalikan angka atau null. Penelepon wajib memeriksa hasil > 0 (sama seperti web).
 */
export function parseAmountId(text: string): number | null {
  let s = String(text ?? "").trim().toLowerCase().replace(/^rp\s*/, "").replace(/\s+/g, "");
  if (s === "") return null;

  let multiplier = 1;
  const suffix = /(jt|juta|rb|ribu|k)$/.exec(s);
  if (suffix) {
    multiplier = suffix[1] === "jt" || suffix[1] === "juta" ? 1_000_000 : 1_000;
    s = s.slice(0, s.length - suffix[1].length);
    if (s === "") return null;
  }

  let normalized: string;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // Format Indonesia penuh: titik = pemisah ribuan, koma = desimal.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Koma + tepat 3 digit di akhir dianggap pemisah ribuan ("25,000" -> 25000),
    // selain itu koma adalah desimal ("25,5" -> 25.5, "25,50" -> 25.50).
    normalized = /^\d{1,3},\d{3}$/.test(s) ? s.replace(",", "") : s.replace(",", ".");
  } else if (hasDot) {
    // Pola ribuan bertitik ("25.000", "1.250.000") dianggap pemisah ribuan,
    // selain itu titik adalah desimal ("25000.50").
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized) * multiplier;
  return Number.isFinite(n) ? n : null;
}

/** Format angka menjadi Rupiah: 1250000 -> "Rp1.250.000"; 25.5 -> "Rp25,50". */
export function formatRupiah(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const intPart = Math.floor(abs);
  const frac = Math.round((abs - intPart) * 100);
  const grouped = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return frac > 0
    ? `${sign}Rp${grouped},${pad(frac)}`
    : `${sign}Rp${grouped}`;
}

/** Draf transaksi yang dikumpulkan selama alur percakapan bot. */
export interface TxDraft {
  name?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  sourceKind?: "fund" | "account";
  sourceId?: string;
  sourceName?: string;
  status?: "completed" | "planned";
  date?: string; // ISO: "2026-11-21"
  amount?: number;
}

/** Baris-baris ringkasan draf, dipakai di layar konfirmasi dan pesan sukses. */
export function summaryLines(d: TxDraft): string[] {
  const lines = [
    `Nama: ${d.name ?? "-"}`,
    `Kategori: ${d.categoryName ?? "(tanpa kategori)"}`,
    `Sumber: ${d.sourceName ?? "-"}`,
    `Status: ${d.status === "planned" ? "Planned (direncanakan)" : "Done (selesai)"}`,
    `Tanggal: ${d.date ? fmtDateId(d.date) : "-"}`,
    `Nominal: ${d.amount !== undefined ? formatRupiah(d.amount) : "-"}`,
  ];
  return lines;
}
