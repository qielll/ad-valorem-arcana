import { supabase } from './supabase.js'
import { MONTHS, fmtDate, fmtNum, parseDate, parseNum, parsePeriod, periodRange } from './format.js'

// Lapisan data: UI bekerja dengan baris datar (flat rows), berkas ini menerjemahkan
// ke dan dari bentuk database. Sejak pemisahan skema, tabel sumber uang ada tiga:
//   account  = saluran pemasukan/pengeluaran (gaji, bunga, biaya admin)
//   fund     = dana anggaran yang punya saldo (dulu baris account dengan is_fund)
//   category = kategori transaksi (dulu teks bebas transaction_category)
// Transaksi menunjuk ke TEPAT SATU sumber: account_id ATAU fund_id.

function check(error) {
  if (error) throw new Error(error.message)
}

const need = (cond, message) => {
  if (!cond) throw new Error(message)
}

/* ---------- periode ---------- */

const monthOrder = (name) => MONTHS.findIndex((m) => m.toLowerCase() === name.toLowerCase())

const toPeriodRow = (p) => ({
  id: p.id,
  name: `${p.periode_month} ${p.periode_year}`,
  ...periodRange(p.periode_month, p.periode_year),
})

async function fetchPeriods() {
  const { data, error } = await supabase.from('periode').select('id, periode_month, periode_year')
  check(error)
  return (data ?? [])
    .sort((a, b) => b.periode_year - a.periode_year || monthOrder(b.periode_month) - monthOrder(a.periode_month))
    .map(toPeriodRow)
}

async function ensurePeriod(month, year) {
  const name = MONTHS[month]
  const found = await supabase
    .from('periode')
    .select('id')
    .eq('periode_month', name)
    .eq('periode_year', year)
    .limit(1)
    .maybeSingle()
  check(found.error)
  if (found.data) return found.data.id

  const created = await supabase
    .from('periode')
    .insert({ periode_month: name, periode_year: year })
    .select('id')
    .single()
  check(created.error)
  return created.data.id
}

const periodIdFor = (iso) => {
  const [y, m] = iso.split('-').map(Number)
  return ensurePeriod(m - 1, y)
}

/* ---------- account (saluran) ---------- */

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')

async function fetchAccounts() {
  const [acc, funds] = await Promise.all([
    supabase
      .from('account')
      .select('id, account_name, account_type, bank, feeds_fund_id, is_system')
      .order('created_at', { ascending: true }),
    supabase.from('fund').select('id, fund_name'),
  ])
  check(acc.error)
  check(funds.error)
  const fundName = new Map((funds.data ?? []).map((f) => [f.id, f.fund_name]))
  return (acc.data ?? []).map((a) => ({
    id: a.id,
    name: a.account_name,
    type: a.account_type === 'income' ? 'in' : 'out',
    label: a.account_type === 'income' ? 'Income' : 'Outcome',
    bank: cap(a.bank),
    feeds: a.feeds_fund_id ? (fundName.get(a.feeds_fund_id) ?? '') : '',
    system: a.is_system,
    // Akun sistem (bunga & biaya admin) diisi job bulanan, tidak ditawarkan untuk entri baru.
    auto: a.is_system,
  }))
}

/* ---------- fund (dana anggaran) ---------- */

async function fetchFunds() {
  const [funds, bal] = await Promise.all([
    supabase
      .from('fund')
      .select('id, fund_name, bank, opening_balance, is_ledger_source')
      .order('created_at', { ascending: true }),
    supabase.from('fund_balance').select('*'),
  ])
  check(funds.error)
  check(bal.error)
  const byId = new Map((bal.data ?? []).map((b) => [b.fund_id, b]))
  return (funds.data ?? []).map((f) => {
    const b = byId.get(f.id)
    const balance = b
      ? Number(b.opening_balance) + Number(b.allocated) - Number(b.spent) + Number(b.repaid) + Number(b.extra_in) - Number(b.extra_out)
      : null
    return {
      id: f.id,
      name: f.fund_name,
      bank: cap(f.bank),
      role: f.is_ledger_source ? 'Ledger fund' : 'Fund',
      isLedgerSource: f.is_ledger_source,
      opening: fmtNum(f.opening_balance),
      balance: balance === null ? '' : fmtNum(balance),
      free: balance === null ? '' : fmtNum(balance - Number(b.planned)),
    }
  })
}

/* ---------- category (kategori transaksi) ---------- */

async function fetchCategories() {
  const [cats, txs] = await Promise.all([
    supabase.from('category').select('id, name, is_system').order('created_at', { ascending: true }),
    supabase.from('transaction').select('category_id'),
  ])
  check(cats.error)
  check(txs.error)
  const used = new Map()
  for (const t of txs.data ?? []) {
    if (t.category_id) used.set(t.category_id, (used.get(t.category_id) ?? 0) + 1)
  }
  return (cats.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    system: c.is_system,
    kind: c.is_system ? 'System' : 'Normal',
    used: fmtNum(used.get(c.id) ?? 0),
  }))
}

// Dipakai entri ledger dan job lain di frontend: kategori sistem dibuat bila belum ada.
async function ensureCategoryId(name) {
  const found = await supabase.from('category').select('id').eq('name', name).limit(1).maybeSingle()
  check(found.error)
  if (found.data) return found.data.id
  const created = await supabase
    .from('category')
    .insert({ name, is_system: true })
    .select('id')
    .single()
  check(created.error)
  return created.data.id
}

/* ---------- transaksi ---------- */

async function fetchTransactions() {
  const { data, error } = await supabase
    .from('transaction')
    .select(
      'id, transaction_name, amount, transaction_date, transaction_status, is_planned, account:account_id(account_name, account_type), fund:fund_id(fund_name), category:category_id(name)',
    )
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)
  check(error)
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.transaction_name,
    category: t.category?.name ?? '',
    status: t.transaction_status,
    planned: t.is_planned,
    // Nama sumber uang: nama account untuk saluran, nama fund untuk dana.
    account: t.account?.account_name ?? t.fund?.fund_name ?? '',
    // Dana selalu pengeluaran; saluran mengikuti account_type miliknya.
    type: t.fund ? 'out' : t.account?.account_type === 'income' ? 'in' : 'out',
    amount: fmtNum(t.amount),
    date: fmtDate(t.transaction_date),
  }))
}

/* ---------- ledger ---------- */

async function fetchLedger() {
  const { data, error } = await supabase
    .from('ledger')
    .select(
      'id, repaid_amount, repayment_status, transaction:transaction_id(id, transaction_name, amount, transaction_date)',
    )
    .order('created_at', { ascending: false })
  check(error)
  return (data ?? [])
    .filter((l) => l.transaction)
    .map((l) => {
      const amount = Number(l.transaction.amount)
      const paid = Number(l.repaid_amount)
      return {
        id: l.id,
        txId: l.transaction.id,
        name: l.transaction.transaction_name,
        amount: fmtNum(amount),
        paid: fmtNum(paid),
        unpaid: fmtNum(Math.max(0, amount - paid)),
        status: { paid: 'Paid off', partial: 'Partial', pending: 'Unpaid' }[l.repayment_status] ?? 'Unpaid',
        date: fmtDate(l.transaction.transaction_date),
      }
    })
}

/* ---------- alokasi ---------- */

async function fetchAllocations() {
  const [al, use] = await Promise.all([
    supabase
      .from('allocation')
      .select('id, amount, periode:periode_id(periode_month, periode_year), fund:fund_id(fund_name)'),
    supabase.from('allocation_usage').select('allocation_id, used'),
  ])
  check(al.error)
  check(use.error)
  const used = new Map((use.data ?? []).map((u) => [u.allocation_id, Number(u.used)]))
  return (al.data ?? [])
    .filter((a) => a.periode && a.fund)
    .sort(
      (a, b) =>
        b.periode.periode_year - a.periode.periode_year ||
        monthOrder(b.periode.periode_month) - monthOrder(a.periode.periode_month) ||
        a.fund.fund_name.localeCompare(b.fund.fund_name),
    )
    .map((a) => {
      const amount = Number(a.amount)
      const u = used.get(a.id) ?? 0
      return {
        id: a.id,
        period: `${a.periode.periode_month} ${a.periode.periode_year}`,
        account: a.fund.fund_name,
        amount: fmtNum(amount),
        used: fmtNum(u),
        pct: amount > 0 ? `${Math.round((u / amount) * 100)}%` : '-',
      }
    })
}

/** Saldo riil tiap bank ({ savings, spending }), dari view bank_balance. */
export async function fetchBanks() {
  const { data, error } = await supabase.from('bank_balance').select('bank, balance')
  check(error)
  return Object.fromEntries((data ?? []).map((b) => [b.bank, Number(b.balance)]))
}

/** Ketujuh daftar, urutannya sama dengan LISTS di lists.jsx. */
export async function fetchAll() {
  return Promise.all([
    fetchTransactions(),
    fetchAccounts(),
    fetchLedger(),
    fetchPeriods(),
    fetchAllocations(),
    fetchFunds(),
    fetchCategories(),
  ])
}

/* ---------- penyimpanan ---------- */

const text = (v) => String(v ?? '').trim()

async function saveTransaction(d, ctx, id) {
  need(text(d.name), 'Name is required.')
  // Sumber uang dicari berdasarkan nama di kedua tabel; nama tidak boleh bentrok
  // antar account dan fund (diperiksa saat menyimpan account/fund).
  const fund = (ctx.funds ?? []).find((f) => f.name === d.account)
  const account = fund ? null : (ctx.accounts ?? []).find((a) => a.name === d.account)
  need(fund || account, 'Pick an account or fund first (add one on the Accounts or Funds list if there are none).')
  const amount = parseNum(d.amount)
  need(amount !== null && amount > 0, 'Amount must be a number greater than 0.')
  const date = parseDate(d.date)
  need(date, 'Date must look like 28 Oct 2026 or 2026-10-28.')
  const category = text(d.category)
    ? (ctx.categories ?? []).find((c) => c.name === text(d.category))
    : null
  need(!text(d.category) || category, 'Pick a category from the Category list (or leave it empty).')

  const row = {
    transaction_name: text(d.name),
    category_id: category?.id ?? null,
    amount,
    transaction_date: date,
    account_id: account?.id ?? null,
    fund_id: fund?.id ?? null,
    periode_id: await periodIdFor(date),
    transaction_status: d.status === 'planned' ? 'planned' : 'completed',
  }
  // is_planned berarti "dianggarkan lebih dulu": diset saat planned, dipertahankan saat ditandai selesai.
  if (d.status === 'planned') row.is_planned = true
  const { error } = id
    ? await supabase.from('transaction').update(row).eq('id', id)
    : await supabase.from('transaction').insert({ is_planned: false, ...row })
  check(error)
}

async function saveAccount(d, ctx, id) {
  need(text(d.name), 'Name is required.')
  need(
    !(ctx.funds ?? []).some((f) => f.name === text(d.name) && f.id !== id),
    'A fund already uses this name. Names must be unique across accounts and funds.',
  )
  const feeds = text(d.feeds) ? (ctx.funds ?? []).find((f) => f.name === text(d.feeds)) : null
  need(!text(d.feeds) || feeds, 'Pick a fund for Feeds (or leave it empty).')
  const row = {
    account_name: text(d.name),
    account_type: d.type === 'in' ? 'income' : 'outcome',
    bank: text(d.bank).toLowerCase() || null,
    feeds_fund_id: feeds?.id ?? null,
    // is_system tidak diubah dari UI: akun sistem dibuat lewat migrasi/job.
  }
  const { error } = id
    ? await supabase.from('account').update(row).eq('id', id)
    : await supabase.from('account').insert(row)
  check(error)
}

async function saveFund(d, ctx, id) {
  need(text(d.name), 'Name is required.')
  need(
    !(ctx.accounts ?? []).some((a) => a.name === text(d.name) && a.id !== id),
    'An account already uses this name. Names must be unique across accounts and funds.',
  )
  const bank = text(d.bank).toLowerCase()
  need(bank, 'A fund needs a bank (Savings or Spending).')
  const opening = text(d.opening) === '' ? 0 : parseNum(d.opening)
  need(opening !== null, 'Opening must be a number.')
  const row = {
    fund_name: text(d.name),
    bank,
    is_ledger_source: d.role === 'Ledger fund',
    opening_balance: opening,
  }
  const { error } = id
    ? await supabase.from('fund').update(row).eq('id', id)
    : await supabase.from('fund').insert(row)
  check(error)
}

async function saveCategory(d, original, id) {
  need(text(d.name), 'Name is required.')
  need(!original?.system, 'System categories cannot be changed.')
  const row = { name: text(d.name) }
  const { error } = id
    ? await supabase.from('category').update(row).eq('id', id)
    : await supabase.from('category').insert(row)
  check(error)
}

async function saveLedger(d, original) {
  need(text(d.name), 'Expense name is required.')
  const amount = parseNum(d.amount)
  need(amount !== null && amount > 0, 'Amount must be a number greater than 0.')
  const paid = parseNum(d.paid ?? '0') ?? 0
  need(paid >= 0 && paid <= amount, 'Paid must be between 0 and the amount.')
  const date = parseDate(d.date)
  need(date, 'Date must look like 28 Oct 2026 or 2026-10-28.')
  const status = paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'pending'
  const periode_id = await periodIdFor(date)

  if (original) {
    const t = await supabase
      .from('transaction')
      .update({ transaction_name: text(d.name), amount, transaction_date: date, periode_id })
      .eq('id', original.txId)
    check(t.error)
    const l = await supabase
      .from('ledger')
      .update({ repaid_amount: paid, repayment_status: status })
      .eq('id', original.id)
    check(l.error)
    return
  }

  // Entri ledger selalu milik sebuah transaksi, jadi entri baru membuat keduanya.
  // Transaksinya dibelanjakan dari dana sumber ledger (Saving Funds).
  const src = await supabase.from('fund').select('id').eq('is_ledger_source', true).limit(1).maybeSingle()
  check(src.error)
  need(src.data, 'No ledger source fund found (set is_ledger_source on Saving Funds).')
  const t = await supabase
    .from('transaction')
    .insert({
      transaction_name: text(d.name),
      category_id: await ensureCategoryId('Ledger'),
      amount,
      transaction_date: date,
      transaction_status: 'completed',
      account_id: null,
      fund_id: src.data.id,
      periode_id,
    })
    .select('id')
    .single()
  check(t.error)
  const l = await supabase
    .from('ledger')
    .insert({ transaction_id: t.data.id, repaid_amount: paid, repayment_status: status })
  if (l.error) {
    await supabase.from('transaction').delete().eq('id', t.data.id)
    check(l.error)
  }
}

async function savePeriod(d, id) {
  const p = parsePeriod(d.name)
  need(p, 'Name must look like October 2026.')
  if (!id) {
    await ensurePeriod(p.month, p.year)
    return
  }
  const { error } = await supabase
    .from('periode')
    .update({ periode_month: MONTHS[p.month], periode_year: p.year })
    .eq('id', id)
  check(error)
}

async function saveAllocation(d, ctx, id) {
  const p = parsePeriod(d.period)
  need(p, 'Period must look like October 2026.')
  const fund = (ctx.funds ?? []).find((f) => f.name === d.account)
  need(fund, 'Pick a fund first (add one on the Funds list if there are none).')
  const amount = parseNum(d.amount)
  need(amount !== null && amount >= 0, 'Amount must be a number, 0 or more.')
  const row = { periode_id: await ensurePeriod(p.month, p.year), fund_id: fund.id, amount }
  // Satu alokasi per dana per periode: menambah lagi berarti mengganti nominalnya.
  const { error } = id
    ? await supabase.from('allocation').update(row).eq('id', id)
    : await supabase.from('allocation').upsert(row, { onConflict: 'periode_id,fund_id' })
  check(error)
}

/**
 * Menyimpan satu baris UI. `original` adalah baris lama saat mengedit, null saat menambah.
 * `ctx` berisi { accounts, funds, categories } untuk mencocokkan nama ke id antar tabel.
 */
export async function saveRow(list, draft, original, ctx) {
  const id = original?.id
  if (list === 0) return saveTransaction(draft, ctx, id)
  if (list === 1) return saveAccount(draft, ctx, id)
  if (list === 2) return saveLedger(draft, original)
  if (list === 4) return saveAllocation(draft, ctx, id)
  if (list === 5) return saveFund(draft, ctx, id)
  if (list === 6) return saveCategory(draft, original, id)
  return savePeriod(draft, id)
}

/* ---------- penghapusan ---------- */

const TABLES = ['transaction', 'account', 'ledger', 'periode', 'allocation', 'fund', 'category']

export async function removeRow(list, row) {
  const { error } = await supabase.from(TABLES[list]).delete().eq('id', row.id)
  check(error)
}
