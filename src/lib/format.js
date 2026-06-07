// Display helpers shared by the Accounts page and the settings screens.

import { localeFor, currencyDecimals } from './currencies'
import i18n from '../i18n'

// The active UI language, for localising month/weekday names via Intl. Number
// and currency formatting still use the currency's own locale (localeFor).
const uiLocale = () => i18n.language || 'en'

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

// Signed money string for BALANCES (net worth, account balances) where a
// negative is meaningful and must never depend on colour alone: negatives get a
// real leading minus ("−Rp 5.000"), positives/zero print plain. Use this — not
// formatAbs — anywhere a figure can legitimately be below zero.
export function formatSigned(amount, currency) {
  const n = Number(amount) || 0
  const s = formatMoney(Math.abs(n), currency)
  return n < 0 ? `−${s}` : s
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

// "2026-06-25" -> "Wed, 25 Jun 2026" (weekday + month name in the UI language).
// Parsed from parts in local time to avoid the UTC off-by-one a bare
// new Date(iso) would introduce.
export function dayLabel(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const loc = uiLocale()
  return `${dt.toLocaleDateString(loc, { weekday: 'short' })}, ${d} ${dt.toLocaleDateString(loc, { month: 'short' })} ${y}`
}

// "June 2026" in the UI language (e.g. "Juni 2026", "มิถุนายน 2026"). Force the
// Gregorian calendar so the year stays 2026 everywhere (Thai locale would
// otherwise show the Buddhist-era year, clashing with the rest of the app).
export function monthYearLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric', calendar: 'gregory' })
}

// English fallbacks (still imported by screens not yet localised).
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

// Account-type label in the UI language (falls back to the English constant).
export function typeLabel(type) {
  return i18n.t(`account.type.${type}`, { defaultValue: TYPE_LABEL[type] ?? type })
}
// For <select> options (resolved at call time so it follows the language).
export function typeOptions() {
  return ['cash', 'debit', 'credit_card'].map((value) => ({ value, label: typeLabel(value) }))
}

// 1 -> "1st", 18 -> "18th", etc.
export function ordinal(n) {
  if (n == null) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// "Cash · IDR" / "Credit card · IDR · settles 18th, due 5th" (type + labels in
// the UI language; the day ordinal stays as-is).
export function accountSubtitle(a) {
  const base = `${typeLabel(a.type)} · ${a.currency}`
  if (a.type === 'credit_card' && (a.settlement_day || a.payment_day)) {
    const bits = []
    if (a.settlement_day) bits.push(i18n.t('account.settlesDay', { day: ordinal(a.settlement_day) }))
    if (a.payment_day) bits.push(i18n.t('account.dueDay', { day: ordinal(a.payment_day) }))
    return `${base} · ${bits.join(', ')}`
  }
  return base
}
