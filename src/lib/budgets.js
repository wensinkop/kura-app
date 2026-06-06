// Budget period math + spend rollup (Session 12). Mirrors Stats' range logic
// (Monday-start weeks, calendar months/years) but is self-contained so the
// Budget page doesn't reach into Stats internals.
//
// Budgets are PER CURRENCY with NO conversion: a budget's spend is the sum of
// that one currency's expense transactions in the category (and its
// sub-categories). This sidesteps the (currently empty) exchange-rates table.

const pad = (n) => String(n).padStart(2, '0')
export const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
const isoOfDate = (dt) => iso(dt.getFullYear(), dt.getMonth(), dt.getDate())
const addDays = (dt, n) => { const d = new Date(dt); d.setDate(d.getDate() + n); return d }
// Monday-start week containing `dt` (matches Stats).
const weekStart = (dt) => { const d = new Date(dt); const dow = (d.getDay() + 6) % 7; return addDays(d, -dow) }
const shortDay = (dt) => `${dt.getDate()} ${dt.toLocaleDateString('en-US', { month: 'short' })}`

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const PERIOD_LABEL = { week: 'Week', month: 'Month', year: 'Year', custom: 'One-off' }

// { start, end (exclusive ISO), label } for a recurring period anchored at a Date.
export function periodRange(period, anchor) {
  if (period === 'week') {
    const s = weekStart(anchor)
    const e = addDays(s, 7)
    const last = addDays(e, -1)
    return { start: isoOfDate(s), end: isoOfDate(e), label: `${shortDay(s)} – ${shortDay(last)} ${last.getFullYear()}` }
  }
  if (period === 'year') {
    const y = anchor.getFullYear()
    return { start: iso(y, 0, 1), end: iso(y + 1, 0, 1), label: String(y) }
  }
  // month
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  return { start: iso(y, m, 1), end: m === 11 ? iso(y + 1, 0, 1) : iso(y, m + 1, 1), label: `${MONTHS[m]} ${y}` }
}

// Step the anchor date by `delta` periods (for the ‹ › nav).
export function shiftAnchor(period, anchor, delta) {
  const d = new Date(anchor)
  if (period === 'week') d.setDate(d.getDate() + delta * 7)
  else if (period === 'year') d.setFullYear(d.getFullYear() + delta)
  else d.setMonth(d.getMonth() + delta) // month
  return d
}

// End-exclusive ISO for querying a custom [start, end] window as [start, endEx).
export function endExclusive(endISO) {
  const [y, m, d] = endISO.split('-').map(Number)
  return isoOfDate(addDays(new Date(y, m - 1, d), 1))
}

// Does transaction `t` count toward a budget on top-level category `catId` in
// `currency`? Expense only; the category itself OR any of its sub-categories.
export function txCountsToward(t, catId, currency) {
  if (t.kind !== 'expense' || t.currency !== currency) return false
  const c = t.category
  return !!c && (c.id === catId || c.parent_id === catId)
}

// Sum spend for (catId, currency) across a transaction list. `within` optionally
// constrains by date (for custom windows fetched as one wider range).
export function spendFor(txns, catId, currency, within) {
  let sum = 0
  for (const t of txns) {
    if (within && (t.date < within.start || t.date > within.end)) continue
    if (txCountsToward(t, catId, currency)) sum += Number(t.amount) || 0
  }
  return sum
}

// Roll a transaction list up into per (top-level category, currency) expense
// sums. Key is `${parentId}|${currency}`. Used for budget spends + the
// "categories with spending but no budget" prompt.
export function rollupByParentCurrency(txns) {
  const map = new Map()
  for (const t of txns) {
    if (t.kind !== 'expense' || !t.category) continue
    const pid = t.category.parent_id || t.category.id
    const key = `${pid}|${t.currency}`
    if (!map.has(key)) map.set(key, { pid, currency: t.currency, spent: 0 })
    map.get(key).spent += Number(t.amount) || 0
  }
  return map
}

// Spent/amount → fill colour + tone. green < 80% ≤ amber ≤ 100% < red.
export function budgetStatus(spent, amount) {
  const ratio = amount > 0 ? spent / amount : 0
  const over = spent > amount
  const near = !over && ratio >= 0.8
  return {
    ratio,
    over,
    near,
    color: over ? '#ef4444' : near ? '#f59e0b' : '#059669',
    remaining: amount - spent,
    pct: Math.round(ratio * 100),
  }
}

// State of a custom window relative to today's ISO date.
export function windowState(startISO, endISO, todayISO) {
  if (todayISO < startISO) return 'upcoming'
  if (todayISO > endISO) return 'past'
  return 'active'
}
