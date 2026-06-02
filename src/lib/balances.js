// Client-side money math for the Accounts page (Chunk 3).
//
// Balances are derived from all transactions (modest counts for a personal app;
// can move to a Postgres aggregate later). Sign convention:
//   income   → + on its account
//   expense  → − on its account
//   transfer → − amount on the source, + to_amount on the destination
// Credit cards therefore go negative = what you owe.

export function computeBalances(txns, accounts = []) {
  const bal = new Map()
  // Seed each account with its opening balance, then apply transaction effects.
  for (const a of accounts) bal.set(a.id, Number(a.opening_balance) || 0)
  const add = (id, v) => { if (id) bal.set(id, (bal.get(id) ?? 0) + v) }
  for (const t of txns) {
    const amt = Number(t.amount) || 0
    if (t.kind === 'income') add(t.account_id, amt)
    else if (t.kind === 'expense') add(t.account_id, -amt)
    else if (t.kind === 'transfer') {
      add(t.account_id, -amt)
      add(t.to_account_id, Number(t.to_amount) || amt)
    }
  }
  return bal
}

// Convert `amount` of `currency` into the base currency. Returns null when a
// non-base currency has no rate set (caller treats that as "unknown").
export function toBase(amount, currency, rates, base) {
  if (currency === base) return amount
  const r = rates[currency]
  return r ? amount * r : null
}

// Net worth in base currency + the list of currencies missing a rate (so the UI
// can prompt the user to set them). Archived accounts are excluded by the caller.
export function netWorth(accounts, balances, rates, base) {
  let total = 0
  const missing = new Set()
  for (const a of accounts) {
    const b = balances.get(a.id) ?? 0
    const v = toBase(b, a.currency, rates, base)
    if (v == null) missing.add(a.currency)
    else total += v
  }
  return { total, missing: [...missing] }
}

// ---- Credit-card billing (simple approximation, Stanley's choice) ----------

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }

function isoOf(y, m, day) {
  const d = Math.min(day, daysInMonth(y, m))
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Most recent occurrence of day-of-month `day` on or before `today` (ISO string).
export function lastOccurrenceOnOrBefore(day, today) {
  let y = today.getFullYear(), m = today.getMonth()
  let iso = isoOf(y, m, day)
  const todayIso = isoOf(y, m, today.getDate())
  if (iso > todayIso) { m -= 1; if (m < 0) { m = 11; y -= 1 } iso = isoOf(y, m, day) }
  return iso
}

// Next occurrence of `day` strictly after the ISO date `afterIso`.
export function nextOccurrenceAfter(day, afterIso) {
  const [ay, am] = afterIso.split('-').map(Number)
  let y = ay, m = am - 1
  let iso = isoOf(y, m, day)
  if (iso <= afterIso) { m += 1; if (m > 11) { m = 0; y += 1 } iso = isoOf(y, m, day) }
  return iso
}

// Outstanding = everything unpaid (= −balance). Payable ≈ charges dated on/before
// the last settlement day, minus payments so far, clamped to [0, outstanding].
// nextDue = next payment-day on/after the last settlement.
export function creditCardBilling(account, txns, balance, today = new Date()) {
  const outstanding = Math.max(0, -(balance ?? 0))
  if (!account.settlement_day) {
    return { outstanding, payable: outstanding, nextDue: null }
  }
  const lastSettle = lastOccurrenceOnOrBefore(account.settlement_day, today)
  let charges = 0, payments = 0
  for (const t of txns) {
    if (t.kind === 'expense' && t.account_id === account.id && t.date <= lastSettle) {
      charges += Number(t.amount) || 0
    } else if (t.kind === 'transfer' && t.to_account_id === account.id) {
      payments += Number(t.to_amount) || 0
    }
  }
  const payable = Math.max(0, Math.min(outstanding, charges - payments))
  const nextDue = account.payment_day ? nextOccurrenceAfter(account.payment_day, lastSettle) : null
  return { outstanding, payable, nextDue }
}
