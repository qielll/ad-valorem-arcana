export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const SHORT = MONTHS.map((m) => m.slice(0, 3))
const pad = (n) => String(n).padStart(2, '0')

/** Month index (0-based) from a full or 3+ letter name, or -1. */
export const monthIndex = (name) => {
  const n = name.trim().toLowerCase()
  return n.length < 3 ? -1 : MONTHS.findIndex((m) => m.toLowerCase().startsWith(n.slice(0, 3)))
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "2026-10-28" -> "28 Oct 2026" */
export const fmtDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${SHORT[m - 1]} ${y}`
}

const toISO = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d))
  const ok = t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
  return ok ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** Accepts "28 Oct 2026" or "2026-10-28"; returns ISO or null. */
export const parseDate = (text) => {
  const t = String(text ?? '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return toISO(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(t)
  if (m && monthIndex(m[2]) >= 0) return toISO(+m[3], monthIndex(m[2]) + 1, +m[1])
  return null
}

export const fmtNum = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })

/** "1,000,000.50" -> 1000000.5, or null when it is not a number. */
export const parseNum = (text) => {
  const s = String(text ?? '').replace(/[,\s]/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "October 2026" or "Oct 2026" -> { month: 9, year: 2026 } or null. */
export const parsePeriod = (text) => {
  const m = /^([A-Za-z]{3,})\.?\s+(\d{4})$/.exec(String(text ?? '').trim())
  if (!m || monthIndex(m[1]) < 0) return null
  return { month: monthIndex(m[1]), year: +m[2] }
}

export const periodRange = (monthName, year) => {
  const mi = monthIndex(monthName)
  const last = new Date(year, mi + 1, 0).getDate()
  return { start: `1 ${SHORT[mi]} ${year}`, end: `${last} ${SHORT[mi]} ${year}` }
}
