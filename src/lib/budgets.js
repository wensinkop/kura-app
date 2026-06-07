// Budget period math + spend rollup (Session 12). Mirrors Stats' range logic
// (Monday-start weeks, calendar months/years) but is self-contained so the
// Budget page doesn't reach into Stats internals.
//
// Budgets are PER CURRENCY with NO conversion: a budget's spend is the sum of
// that one currency's expense transactions in the category (and its
// sub-categories). This sidesteps the (currently empty) exchange-rates table.

import i18n from '../i18n'

const pad = (n) => String(n).padStart(2, '0')
export const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
const isoOfDate = (dt) => iso(dt.getFullYear(), dt.getMonth(), dt.getDate())
const addDays = (dt, n) => { const d = new Date(dt); d.setDate(d.getDate() + n); return d }
// Monday-start week containing `dt` (matches Stats).
const weekStart = (dt) => { const d = new Date(dt); const dow = (d.getDay() + 6) % 7; return addDays(d, -dow) }
// Month/weekday names follow the UI language (number formatting is unaffected).
const uiLocale = () => i18n.language || 'en'
const shortDay = (dt) => `${dt.getDate()} ${dt.toLocaleDateString(uiLocale(), { month: 'short' })}`

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
  const label = new Date(y, m, 1).toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric', calendar: 'gregory' })
  return { start: iso(y, m, 1), end: m === 11 ? iso(y + 1, 0, 1) : iso(y, m + 1, 1), label }
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

const addDaysISO = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  return isoOfDate(addDays(new Date(y, m - 1, d), n))
}

// The amount in effect for a budget in the month starting `monthStartISO`
// (Budget v2 per-month amounts). `entries` is this budget's budget_amounts rows
// ([{ from_month, amount }]); the value is the latest entry with
// from_month <= monthStart, falling back to the budget's base amount. Per-month
// amounts apply to MONTHLY budgets; week/year/custom just use budget.amount.
export function amountForMonth(budget, entries, monthStartISO) {
  if (budget.period !== 'month' || !entries || entries.length === 0) return Number(budget.amount) || 0
  let best = null
  for (const e of entries) {
    if (e.from_month <= monthStartISO && (!best || e.from_month > best.from_month)) best = e
  }
  return best ? Number(best.amount) || 0 : Number(budget.amount) || 0
}

// Rollover carried INTO the viewed period for a recurring budget. Sums
// (amount − spent) over every whole period from the budget's creation period up
// to (not including) the viewed period, using `historicalTxns` (fetched for
// [firstPeriodStart, viewedStart)). Forgiving floors each period's net at 0 —
// overspend is forgiven; strict carries the net, so overspend reduces the pot.
// `cat` is the budget's category object (so sub vs parent spend is scoped
// correctly); `entries` are its per-month amounts. Returns 0 for non-recurring
// or rollover='none'.
export function carryover(budget, cat, historicalTxns, viewedStartISO, entries = []) {
  const mode = budget.rollover
  if (!mode || mode === 'none' || budget.period === 'custom') return 0
  let anchor = new Date(budget.created_at)
  let r = periodRange(budget.period, anchor)
  let carry = 0
  // Guard against an unbounded loop (weekly over decades): ~1200 weeks ≈ 23 yrs.
  for (let guard = 0; r.start < viewedStartISO && guard < 1200; guard++) {
    const amt = budget.period === 'month' ? amountForMonth(budget, entries, r.start) : (Number(budget.amount) || 0)
    const spent = spendFor(historicalTxns, cat, budget.currency, {
      start: r.start,
      end: addDaysISO(r.end, -1), // period end is exclusive; spendFor wants inclusive
    })
    const net = amt - spent
    carry += mode === 'forgiving' ? Math.max(0, net) : net
    anchor = shiftAnchor(budget.period, anchor, 1)
    r = periodRange(budget.period, anchor)
  }
  return carry
}

// Does transaction `t` count toward a budget on category `cat` in `currency`?
// Expense only. A PARENT-category budget counts the parent and all its
// sub-categories; a SUB-category budget (cat.parent_id set) counts only that sub.
export function txCountsToward(t, cat, currency) {
  if (t.kind !== 'expense' || t.currency !== currency || !cat) return false
  const c = t.category
  if (!c) return false
  if (cat.parent_id) return c.id === cat.id
  return c.id === cat.id || c.parent_id === cat.id
}

// Sum spend for (cat, currency) across a transaction list. `cat` is a category
// object. `within` optionally constrains by date (for custom windows fetched as
// one wider range).
export function spendFor(txns, cat, currency, within) {
  let sum = 0
  for (const t of txns) {
    if (within && (t.date < within.start || t.date > within.end)) continue
    if (txCountsToward(t, cat, currency)) sum += Number(t.amount) || 0
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
