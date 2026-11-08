export const transactions = [
  { name: 'Shortsword', category: 'Salary', account: 'Saving Funds', date: '28 Oct 2026', type: 'in', amount: '1,000,000' },
  { name: 'Shortsword', category: 'Salary', account: 'Saving', date: '28 Oct 2026', type: 'out', amount: '1,000,000' },
]

export const accounts = [
  { name: 'BCA', type: 'in', label: 'Income' },
  { name: 'BCA', type: 'out', label: 'Outcome' },
]

export const ledger = [
  { name: 'Shortsword', amount: '900,000', paid: '900,000', unpaid: '900,000', date: '28 Oct 2026' },
  { name: 'Shortsword', amount: '900,000', paid: '900,000', unpaid: '900,000', date: '28 Oct 2026' },
]

// There is no mockup for Period: these fields and rows are placeholders.
// Change them here and adjust the Period entry in src/lists.jsx to match.
export const periods = [
  { name: 'September 2026', start: '1 Sep 2026', end: '30 Sep 2026' },
  { name: 'October 2026', start: '1 Oct 2026', end: '31 Oct 2026' },
]
