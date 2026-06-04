// Display helpers shared by the Accounts page and the settings screens.

import { localeFor, currencyDecimals } from './currencies'

// Format a number as money in its currency, e.g. 750000/IDR -> "Rp 750.000",
// 120/USD -> "$120.00". Decimals come from our catalogue (currencyDecimals),
// not ICU, so IDR stays whole. Pass the absolute value; add +/− at the call site.
export function formatMoney(amount, currency) {
  const n = Number(amount) || 0
  const d = currencyDecimals(currency)
  try {
    return new Intl.NumberFormat(localeFor(currency), {
      style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(n)
  } catch {
    return `${currency} ${n}`
  }
}

// Always-positive money string (no leading minus); color conveys the sign.
export function formatAbs(amount, currency) {
  return formatMoney(Math.abs(Number(amount) || 0), currency)
}

// Sign → colour. Positive = green, negative = red, zero = neutral. No +/− text.
export function amountColor(v) {
  return v > 0 ? 'text-income' : v < 0 ? 'text-expense' : 'text-muted'
}

// ISO 'YYYY-MM-DD' -> a numeric date string in the user's chosen order. Parsed
// from the string parts (no Date object) so there's no timezone shifting.
//   'dmy' (default) -> 31-12-2026 · 'mdy' -> 12-31-2026 · 'ymd' -> 2026-12-31
export const DATE_FORMAT_LABELS = {
  dmy: 'Day-Month-Year',
  mdy: 'Month-Day-Year',
  ymd: 'Year-Month-Day',
}
export function formatDate(iso, format = 'dmy') {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  if (format === 'mdy') return `${m}-${d}-${y}`
  if (format === 'ymd') return `${y}-${m}-${d}`
  return `${d}-${m}-${y}`
}

// "2026-06-25" -> "Wed, 25 Jun 2026". Parsed from parts in local time to avoid
// the UTC off-by-one a bare new Date(iso) would introduce.
export function dayLabel(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${dt.toLocaleDateString('en-US', { weekday: 'short' })}, ${d} ${dt.toLocaleDateString('en-US', { month: 'short' })} ${y}`
}

export const TYPE_LABEL = {
  cash: 'Cash',
  debit: 'Debit',
  credit_card: 'Credit card',
}

export const TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'debit', label: 'Debit' },
  { value: 'credit_card', label: 'Credit card' },
]

// 1 -> "1st", 18 -> "18th", etc.
export function ordinal(n) {
  if (n == null) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// "Cash · IDR" / "Credit card · IDR · settles 18th, due 5th"
export function accountSubtitle(a) {
  const base = `${TYPE_LABEL[a.type] ?? a.type} · ${a.currency}`
  if (a.type === 'credit_card' && (a.settlement_day || a.payment_day)) {
    const bits = []
    if (a.settlement_day) bits.push(`settles ${ordinal(a.settlement_day)}`)
    if (a.payment_day) bits.push(`due ${ordinal(a.payment_day)}`)
    return `${base} · ${bits.join(', ')}`
  }
  return base
}
