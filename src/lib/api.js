import { supabase } from './supabase.js'
import { MONTHS, fmtDate, fmtNum, parseDate, parseNum, parsePeriod, periodRange } from './format.js'

// Same four tables as the finance tracker (periode, account, transaction, ledger).
// The menu works with flat UI rows; this file converts to and from the database shape.

function check(error) {
  if (error) throw new Error(error.message)
}

const need = (cond, message) => {
  if (!cond) throw new Error(message)
}

/* ---------- periods ---------- */

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

/* ---------- accounts ---------- */

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')

async function fetchAccounts() {
  const [acc, bal] = await Promise.all([
    supabase
      .from('account')
      .select('id, account_name, account_type, bank, is_fund, is_ledger_source, opening_balance, feeds_account_id')
      .order('created_at', { ascending: true }),
    supabase.from('account_balance').select('*'),
  ])
  check(acc.error)
  check(bal.error)
  const byId = new Map((bal.data ?? []).map((b) => [b.account_id, b]))
  return (acc.data ?? []).map((a) => {
    const b = byId.get(a.id)
    const balance = b
      ? Number(b.opening_balance) + Number(b.allocated) - Number(b.spent) + Number(b.repaid) + Number(b.extra_in) - Number(b.extra_out)
      : null
    return {
      id: a.id,
      name: a.account_name,
      type: a.account_type === 'income' ? 'in' : 'out',
      label: a.account_type === 'income' ? 'Income' : 'Outcome',
      bank: cap(a.bank),
      role: a.is_ledger_source ? 'Ledger fund' : a.is_fund ? 'Fund' : 'Plain',
      isFund: a.is_fund,
      opening: fmtNum(a.opening_balance),
      balance: balance === null ? '' : fmtNum(balance),
      free: balance === null ? '' : fmtNum(balance - Number(b.planned)),
      // Interest and bank fee accounts are posted by the monthly job, not picked by hand.
      auto: !!a.feeds_account_id || a.account_name === 'Bank Admin Fee',
    }
  })
}

/* ---------- transactions ---------- */

async function fetchTransactions() {
  const { data, error } = await supabase
    .from('transaction')
    .select(
      'id, transaction_name, transaction_category, amount, transaction_date, transaction_status, is_planned, account:account_id(account_name, account_type)',
    )
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)
  check(error)
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.transaction_name,
    category: t.transaction_category ?? '',
    status: t.transaction_status,
    planned: t.is_planned,
    account: t.account?.account_name ?? '',
    type: t.account?.account_type === 'income' ? 'in' : 'out',
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

/* ---------- allocations ---------- */

async function fetchAllocations() {
  const [al, use] = await Promise.all([
    supabase
      .from('allocation')
      .select('id, amount, periode:periode_id(periode_month, periode_year), account:account_id(account_name)'),
    supabase.from('allocation_usage').select('allocation_id, used'),
  ])
  check(al.error)
  check(use.error)
  const used = new Map((use.data ?? []).map((u) => [u.allocation_id, Number(u.used)]))
  return (al.data ?? [])
    .filter((a) => a.periode && a.account)
    .sort(
      (a, b) =>
        b.periode.periode_year - a.periode.periode_year ||
        monthOrder(b.periode.periode_month) - monthOrder(a.periode.periode_month) ||
        a.account.account_name.localeCompare(b.account.account_name),
    )
    .map((a) => {
      const amount = Number(a.amount)
      const u = used.get(a.id) ?? 0
      return {
        id: a.id,
        period: `${a.periode.periode_month} ${a.periode.periode_year}`,
        account: a.account.account_name,
        amount: fmtNum(amount),
        used: fmtNum(u),
        pct: amount > 0 ? `${Math.round((u / amount) * 100)}%` : '-',
      }
    })
}

/** Real balance of each bank ({ savings, spending }), from the bank_balance view. */
export async function fetchBanks() {
  const { data, error } = await supabase.from('bank_balance').select('bank, balance')
  check(error)
  return Object.fromEntries((data ?? []).map((b) => [b.bank, Number(b.balance)]))
}

/** All five lists, in the same order as LISTS in lists.jsx. */
export async function fetchAll() {
  return Promise.all([fetchTransactions(), fetchAccounts(), fetchLedger(), fetchPeriods(), fetchAllocations()])
}

/* ---------- saving ---------- */

const text = (v) => String(v ?? '').trim()

async function saveTransaction(d, accounts, id) {
  need(text(d.name), 'Name is required.')
  const account = accounts.find((a) => a.name === d.account)
  need(account, 'Pick an account first (add one on the Accounts list if there are none).')
  const amount = parseNum(d.amount)
  need(amount !== null && amount > 0, 'Amount must be a number greater than 0.')
  const date = parseDate(d.date)
  need(date, 'Date must look like 28 Oct 2026 or 2026-10-28.')

  const row = {
    transaction_name: text(d.name),
    transaction_category: text(d.category) || null,
    amount,
    transaction_date: date,
    account_id: account.id,
    periode_id: await periodIdFor(date),
    transaction_status: d.status === 'planned' ? 'planned' : 'completed',
  }
  // is_planned means "budgeted in advance": set when planned, kept when the row is later marked done.
  if (d.status === 'planned') row.is_planned = true
  const { error } = id
    ? await supabase.from('transaction').update(row).eq('id', id)
    : await supabase.from('transaction').insert({ is_planned: false, ...row })
  check(error)
}

async function saveAccount(d, id) {
  need(text(d.name), 'Name is required.')
  const bank = text(d.bank).toLowerCase()
  const isFund = d.role === 'Fund' || d.role === 'Ledger fund'
  need(!isFund || bank, 'A fund needs a bank (Savings or Spending).')
  const opening = text(d.opening) === '' ? 0 : parseNum(d.opening)
  need(opening !== null, 'Opening must be a number.')
  const row = {
    account_name: text(d.name),
    account_type: d.type === 'in' ? 'income' : 'outcome',
    bank: bank || null,
    is_fund: isFund,
    is_ledger_source: d.role === 'Ledger fund',
    opening_balance: opening,
  }
  const { error } = id
    ? await supabase.from('account').update(row).eq('id', id)
    : await supabase.from('account').insert(row)
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

  // A ledger entry belongs to a transaction, so a new one creates both.
  // The transaction is spent from the savings fund (the ledger source account).
  const src = await supabase.from('account').select('id').eq('is_ledger_source', true).limit(1).maybeSingle()
  check(src.error)
  need(src.data, 'No ledger source account found (set is_ledger_source on Saving Funds).')
  const t = await supabase
    .from('transaction')
    .insert({
      transaction_name: text(d.name),
      transaction_category: 'Ledger',
      amount,
      transaction_date: date,
      transaction_status: 'completed',
      account_id: src.data.id,
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

async function saveAllocation(d, accounts, id) {
  const p = parsePeriod(d.period)
  need(p, 'Period must look like October 2026.')
  const account = accounts.find((a) => a.name === d.account && a.isFund)
  need(account, 'Pick a fund first (set an account to Fund on the Accounts list).')
  const amount = parseNum(d.amount)
  need(amount !== null && amount >= 0, 'Amount must be a number, 0 or more.')
  const row = { periode_id: await ensurePeriod(p.month, p.year), account_id: account.id, amount }
  // One allocation per fund per period: adding again just replaces the amount.
  const { error } = id
    ? await supabase.from('allocation').update(row).eq('id', id)
    : await supabase.from('allocation').upsert(row, { onConflict: 'periode_id,account_id' })
  check(error)
}

/**
 * Saves one UI row. `original` is the existing row when editing, null when adding.
 * `accounts` are the current account rows (used to resolve the account name to its id).
 */
export async function saveRow(list, draft, original, accounts) {
  const id = original?.id
  if (list === 0) return saveTransaction(draft, accounts, id)
  if (list === 1) return saveAccount(draft, id)
  if (list === 2) return saveLedger(draft, original)
  if (list === 4) return saveAllocation(draft, accounts, id)
  return savePeriod(draft, id)
}

const TABLES = ['transaction', 'account', 'ledger', 'periode', 'allocation']

export async function removeRow(list, row) {
  const { error } = await supabase.from(TABLES[list]).delete().eq('id', row.id)
  check(error)
}
