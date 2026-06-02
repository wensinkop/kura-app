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
