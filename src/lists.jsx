import TrendArrow from './components/TrendArrow.jsx'
import { MONTHS, fmtDate, todayISO } from './lib/format.js'

const T = 'whitespace-nowrap fs-46 font-semibold ls-3'
const C = 'justify-self-center'
const M = `${C} whitespace-nowrap fs-44 font-semibold ls-3` // medium centered cell

const thisPeriod = () => {
  const d = new Date()
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// planned = still to spend; done = spent as planned; unplanned = spent without being budgeted.
const txStatus = (r) => (r.status === 'planned' ? 'Planned' : r.planned ? 'Done' : 'Unplanned')

// Shared by the "Save a Money!" list page and the "What to do with these data?" page.
// rowH = row height on the list page, in mockup pixels.
export const LISTS = [
  {
    title: 'Transaction',
    cols: 'grid-cols-[380fr_270fr_360fr_220fr_290fr_360fr]',
    headers: [['Name', 'pl-30'], ['Category', C], ['Account', C], ['Status', C], ['Date', C], ['Amount', C]],
    rowH: 125,
    radius: 'r-8',
    gap: 'gap-1',
    describe: (r) => [
      `${r.name} is ${r.type === 'in' ? 'income' : 'outcome'}`,
      `${r.amount} on ${r.date}, ${txStatus(r).toLowerCase()}`,
    ],
    // fields[i] edits grid column i: { key }, { key, select } (options from the backend), { choices } (fixed list),
    // { kind: true } (in/out select) or null (read-only).
    // defaults() fills a new row; api.js validates and saves it.
    fields: [
      { key: 'name' },
      { key: 'category', select: 'category', optional: true },
      { key: 'account', select: 'account' },
      { key: 'status', choices: [['completed', 'Done'], ['planned', 'Planned']] },
      { key: 'date' },
      { key: 'amount' },
    ],
    blank: { name: '', category: '', account: '', status: 'completed', date: '', amount: '' },
    defaults: () => ({ date: fmtDate(todayISO()) }),
    render: (r) => (
      <>
        <span className={`${T} pl-26`}>{r.name}</span>
        <span className={`${T} ${C}`}>{r.category}</span>
        <span className={`${C} w-300 text-center fs-42 font-semibold ls-3 lh-44`}>{r.account}</span>
        <span className={`${C} whitespace-nowrap fs-38 font-semibold ls-2`}>
          {r.status === 'planned' ? (
            <span className="r-4 px-12 py-3" style={{ border: 'calc(var(--u) * 3) solid currentColor' }}>
              Planned
            </span>
          ) : (
            txStatus(r)
          )}
        </span>
        <span className={`${T} ${C}`}>{r.date}</span>
        <span className={`${T} ${C} flex items-center gap-14`}>
          <TrendArrow type={r.type} className="h-44 w-44" />
          {r.amount}
        </span>
      </>
    ),
  },
  {
    // Sejak pemisahan skema, daftar Account hanya berisi saluran uang (gaji, bunga,
    // biaya admin). Dana anggaran pindah ke daftar Fund di bawah.
    title: 'Account',
    cols: 'grid-cols-[460fr_300fr_260fr_420fr_444fr]',
    headers: [['Name', 'pl-30'], ['Type', C], ['Bank', C], ['Feeds Fund', C], ['Role', C]],
    rowH: 64,
    radius: 'r-6',
    gap: 'gap-6',
    describe: (r) =>
      r.system ? [`${r.name} is a`, 'system account'] : [`${r.name} is an`, `${r.label} account`],
    fields: [
      { key: 'name' },
      { key: 'type', kind: true },
      { key: 'bank', select: 'bank', optional: true },
      { key: 'feeds', select: 'fund', optional: true },
      null,
    ],
    blank: { name: '', type: 'in', bank: '', feeds: '' },
    render: (r) => (
      <>
        <span className="whitespace-nowrap pl-26 fs-46 font-semibold">{r.name}</span>
        <span className={`${C} flex items-center gap-13 whitespace-nowrap fs-44 font-semibold ls-3`}>
          <TrendArrow type={r.type} className="h-40 w-40" />
          {r.label}
        </span>
        <span className={M}>{r.bank}</span>
        <span className={M}>{r.feeds}</span>
        <span className={M}>{r.system ? 'System' : 'Normal'}</span>
      </>
    ),
  },
  {
    title: 'Ledger',
    cols: 'grid-cols-[420fr_300fr_300fr_300fr_260fr_304fr]',
    headers: [['Expense Name', ''], ['Amount', C], ['Paid', C], ['Unpaid', C], ['Status', C], ['Date', C]],
    rowH: 64,
    radius: 'r-6',
    gap: 'gap-0',
    describe: (r) => [`${r.name} still has`, `${r.unpaid} unpaid`],
    fields: [{ key: 'name' }, { key: 'amount' }, { key: 'paid' }, null, null, { key: 'date' }],
    blank: { name: '', amount: '', paid: '0', date: '' },
    defaults: () => ({ date: fmtDate(todayISO()) }),
    render: (r) => (
      <>
        <span className="whitespace-nowrap pl-29 fs-46 font-semibold">{r.name}</span>
        <span className={`${C} whitespace-nowrap fs-46 font-semibold ls-4`}>{r.amount}</span>
        <span className={`${C} whitespace-nowrap fs-46 font-semibold ls-4`}>{r.paid}</span>
        <span className={`${C} whitespace-nowrap fs-46 font-semibold ls-4`}>{r.unpaid}</span>
        <span className={`${C} whitespace-nowrap fs-40 font-semibold ls-2`}>{r.status}</span>
        <span className={`${C} whitespace-nowrap fs-44 font-semibold`}>{r.date}</span>
      </>
    ),
  },
  {
    // Placeholder layout (no mockup) in the same style as the others.
    title: 'Period',
    cols: 'grid-cols-[640fr_620fr_624fr]',
    headers: [['Name', 'pl-30'], ['Start Date', C], ['End Date', C]],
    rowH: 64,
    radius: 'r-6',
    gap: 'gap-6',
    describe: (r) => [r.name, `${r.start} to ${r.end}`],
    fields: [{ key: 'name' }, null, null],
    blank: { name: '' },
    render: (r) => (
      <>
        <span className={`${T} pl-26`}>{r.name}</span>
        <span className={`${T} ${C}`}>{r.start}</span>
        <span className={`${T} ${C}`}>{r.end}</span>
      </>
    ),
  },
  {
    // How much of each month's salary goes to each fund (Master Sheet I:L) and how much of it is used.
    title: 'Allocation',
    cols: 'grid-cols-[480fr_520fr_300fr_300fr_284fr]',
    headers: [['Period', 'pl-30'], ['Fund', C], ['Allocated', C], ['Used', C], ['Used %', C]],
    rowH: 64,
    radius: 'r-6',
    gap: 'gap-6',
    describe: (r) => [`${r.account} gets ${r.amount}`, `${r.period}, ${r.pct} used`],
    fields: [{ key: 'period' }, { key: 'account', select: 'fund' }, { key: 'amount' }, null, null],
    blank: { period: '', account: '', amount: '' },
    defaults: () => ({ period: thisPeriod() }),
    render: (r) => (
      <>
        <span className={`${T} pl-26`}>{r.period}</span>
        <span className={`${C} whitespace-nowrap fs-44 font-semibold ls-3`}>{r.account}</span>
        <span className={`${T} ${C}`}>{r.amount}</span>
        <span className={`${T} ${C}`}>{r.used}</span>
        <span className={`${T} ${C}`}>{r.pct}</span>
      </>
    ),
  },
  {
    // Dana anggaran (tabel fund): pos-pos belanja dari spreadsheet yang punya saldo,
    // mendapat alokasi, dan tinggal di salah satu bank. Gaya sama seperti daftar Account lama.
    title: 'Fund',
    cols: 'grid-cols-[460fr_280fr_340fr_380fr_424fr]',
    headers: [['Name', 'pl-30'], ['Bank', C], ['Role', C], ['Opening', C], ['Balance', C]],
    rowH: 64,
    radius: 'r-6',
    gap: 'gap-6',
    describe: (r) => [`${r.name} holds ${r.balance}`, `${r.free} free after planned`],
    fields: [
      { key: 'name' },
      { key: 'bank', select: 'bank' },
      { key: 'role', choices: [['Fund', 'Fund'], ['Ledger fund', 'Ledger fund']] },
      { key: 'opening' },
      null,
    ],
    blank: { name: '', bank: '', role: 'Fund', opening: '' },
    render: (r) => (
      <>
        <span className="whitespace-nowrap pl-26 fs-46 font-semibold">{r.name}</span>
        <span className={M}>{r.bank}</span>
        <span className={M}>{r.role}</span>
        <span className={M}>{r.opening}</span>
        <span className={M}>{r.balance}</span>
      </>
    ),
  },
  {
    // Kategori transaksi (tabel category): dulu teks bebas di kolom transaction_category.
    // Kategori sistem (Auto:*, Ledger) hanya ditampilkan, tidak bisa diubah dari sini.
    title: 'Category',
    cols: 'grid-cols-[700fr_590fr_594fr]',
    headers: [['Name', 'pl-30'], ['Kind', C], ['Used', C]],
    rowH: 64,
    radius: 'r-6',
    gap: 'gap-6',
    describe: (r) => [`${r.name} is a`, `${r.kind.toLowerCase()} category`],
    fields: [{ key: 'name' }, null, null],
    blank: { name: '' },
    render: (r) => (
      <>
        <span className={`${T} pl-26`}>{r.name}</span>
        <span className={M}>{r.kind}</span>
        <span className={`${T} ${C}`}>{r.used}</span>
      </>
    ),
  },
]
