import { fmtNum } from '../lib/format.js'

// Total of both real bank balances, with each bank underneath (from the bank_balance view).
export default function RpBox({ className = '', banks = null }) {
  const show = (n) => (n === null || n === undefined ? '-' : fmtNum(n))
  const total = banks ? (banks.spending ?? 0) + (banks.savings ?? 0) : null

  return (
    <div
      className={`anim-slide-r absolute right-0 top-63 flex h-72 w-465 items-center justify-between bg-ink pl-28 pr-44 font-semibold text-white ${className}`}
    >
      <span className="fs-48">Rp</span>
      <span className="fs-52 ls-3">{show(total)}</span>
      <div className="absolute right-0 top-full flex h-38 w-full items-center justify-between bg-paper2 pl-28 pr-44 fs-24 font-bold text-ink">
        <span>Spending {show(banks?.spending)}</span>
        <span>Savings {show(banks?.savings)}</span>
      </div>
    </div>
  )
}
