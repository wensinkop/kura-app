// Currency catalogue for Smara.
//
// Each account fixes ONE currency at creation (locked decision, Session 0).
// We need two things everywhere:
//   1. a searchable picker list  -> currencyOptions() feeds SearchableSelect
//   2. a sensible locale per code -> NumberInput formats "Rp 10.000.000" vs "$ 10,000.00"
//
// The list is ISO-4217 (common subset, generous enough for real use). `POPULAR`
// floats the codes most Smara users reach for to the top of the picker; the rest
// follow alphabetically. `localeFor` maps a code to the locale whose grouping /
// decimal conventions match it, so NumberInput renders the right separators.

// Codes shown first in the picker (Indonesia-first, then majors / regional).
export const POPULAR = ['IDR', 'USD', 'EUR', 'SGD', 'MYR', 'AUD', 'GBP', 'JPY', 'CNY']

// code -> { name, locale }. locale drives Intl number formatting in NumberInput.
// Where a currency has a natural home locale we use it; otherwise a locale that
// shares the same separator/decimal convention.
export const CURRENCIES = {
  IDR: { name: 'Indonesian Rupiah', locale: 'id-ID' },
  USD: { name: 'US Dollar', locale: 'en-US' },
  EUR: { name: 'Euro', locale: 'de-DE' },
  GBP: { name: 'British Pound', locale: 'en-GB' },
  JPY: { name: 'Japanese Yen', locale: 'ja-JP' },
  CNY: { name: 'Chinese Yuan', locale: 'zh-CN' },
  SGD: { name: 'Singapore Dollar', locale: 'en-SG' },
  MYR: { name: 'Malaysian Ringgit', locale: 'ms-MY' },
  THB: { name: 'Thai Baht', locale: 'th-TH' },
  PHP: { name: 'Philippine Peso', locale: 'en-PH' },
  VND: { name: 'Vietnamese Dong', locale: 'vi-VN' },
  AUD: { name: 'Australian Dollar', locale: 'en-AU' },
  NZD: { name: 'New Zealand Dollar', locale: 'en-NZ' },
  HKD: { name: 'Hong Kong Dollar', locale: 'en-HK' },
  KRW: { name: 'South Korean Won', locale: 'ko-KR' },
  INR: { name: 'Indian Rupee', locale: 'en-IN' },
  CAD: { name: 'Canadian Dollar', locale: 'en-CA' },
  CHF: { name: 'Swiss Franc', locale: 'de-CH' },
  SEK: { name: 'Swedish Krona', locale: 'sv-SE' },
  NOK: { name: 'Norwegian Krone', locale: 'nb-NO' },
  DKK: { name: 'Danish Krone', locale: 'da-DK' },
  AED: { name: 'UAE Dirham', locale: 'ar-AE' },
  SAR: { name: 'Saudi Riyal', locale: 'ar-SA' },
  ZAR: { name: 'South African Rand', locale: 'en-ZA' },
  BRL: { name: 'Brazilian Real', locale: 'pt-BR' },
  MXN: { name: 'Mexican Peso', locale: 'es-MX' },
  TRY: { name: 'Turkish Lira', locale: 'tr-TR' },
  RUB: { name: 'Russian Ruble', locale: 'ru-RU' },
  PLN: { name: 'Polish Zloty', locale: 'pl-PL' },
  TWD: { name: 'New Taiwan Dollar', locale: 'zh-TW' },
}

// Currencies with NO minor unit (whole numbers only). We set this explicitly
// because some ICU builds wrongly report IDR as 2-decimal — trusting Intl gives
// "Rp 186.000,00" instead of the correct "Rp 186.000".
export const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND'])

// Decimal places to use for a currency (overrides ICU quirks).
export function currencyDecimals(code) {
  return ZERO_DECIMAL.has(code) ? 0 : 2
}

// Locale to format amounts in for a given currency code. Falls back to en-US,
// whose conventions are the safest generic default for unknown codes.
export function localeFor(code) {
  return CURRENCIES[code]?.locale ?? 'en-US'
}

export function currencyName(code) {
  return CURRENCIES[code]?.name ?? code
}

// Options for SearchableSelect: popular codes first (no group header keeps the
// list clean), then the rest alphabetically. Label = "IDR — Indonesian Rupiah"
// so users can search by either the code or the name.
export function currencyOptions() {
  const all = Object.keys(CURRENCIES)
  const rest = all.filter((c) => !POPULAR.includes(c)).sort()
  const ordered = [...POPULAR.filter((c) => CURRENCIES[c]), ...rest]
  return ordered.map((code) => ({
    value: code,
    label: `${code} — ${CURRENCIES[code].name}`,
  }))
}
