// src/components/NumberInput.jsx
//
// Reusable numeric input with live locale-aware currency formatting.
// Ported from the Gelato app (logic unchanged — it is battle-tested); only the
// visual styling was swapped to Kura's design tokens.
//
// Why this exists:
// - Display "Rp 10.000.000,00" (id-ID) while the user types 10000000, and store
//   the value in state/DB as a plain JS number (10000000).
// - id-ID uses "," as the ONLY decimal separator; "." is always grouping noise.
//   The rule flips for en-US etc. — all driven by Intl for the given `locale`.
// - The component owns caret placement when separators are inserted/removed.
//
// Multi-currency ready: `locale` and `currency` are props, so the same component
// serves every Kura account currency (IDR 0-decimals, USD 2-decimals, …).
//
// Usage:
//   <NumberInput value={amount} onChange={setAmount} />                       // Rp, 0 decimals
//   <NumberInput value={amount} onChange={setAmount} locale="en-US" currency="USD" /> // $, 2 decimals
//   <NumberInput value={qty} onChange={setQty} currency={null} decimals={2} /> // plain number

import { useEffect, useMemo, useRef, useState } from 'react'

function resolveDecimals({ decimals, locale, currency }) {
  if (Number.isInteger(decimals) && decimals >= 0) return decimals
  if (currency) {
    try {
      const opts = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
      return opts.maximumFractionDigits ?? 0
    } catch {
      return 0
    }
  }
  return 0
}

function resolveSeparators(locale) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  const group = parts.find((p) => p.type === 'group')?.value ?? ','
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.'
  return { group, decimal }
}

function resolveCurrencySymbol(locale, currency) {
  if (!currency) return null
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    }).formatToParts(0)
    const symbol = parts.find((p) => p.type === 'currency')?.value
    return symbol || currency
  } catch {
    return currency
  }
}

function groupInteger(intDigits, groupSep) {
  if (!intDigits) return ''
  const cleaned = intDigits.replace(/^0+(?=\d)/, '')
  return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep)
}

function displayToNumber(display, { decimal, group }) {
  if (display === '' || display === '-' || display == null) return null
  const normalized = display.split(group).join('').replace(decimal, '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function numberToDisplay(value, { decimal, group, decimals }) {
  if (value == null || value === '' || Number.isNaN(value)) return ''
  const negative = value < 0
  const abs = Math.abs(value)
  let intPart
  let fracPart = ''
  if (decimals > 0) {
    const fixed = abs.toFixed(decimals)
    const dotIdx = fixed.indexOf('.')
    intPart = fixed.slice(0, dotIdx)
    fracPart = fixed.slice(dotIdx + 1).replace(/0+$/, '')
  } else {
    intPart = String(Math.trunc(abs))
  }
  const grouped = groupInteger(intPart, group)
  const sign = negative ? '-' : ''
  return fracPart ? `${sign}${grouped}${decimal}${fracPart}` : `${sign}${grouped}`
}

function countDigitsBefore(str, caretIdx) {
  let count = 0
  for (let i = 0; i < caretIdx && i < str.length; i++) {
    if (/[0-9]/.test(str[i])) count++
  }
  return count
}

function findIndexAfterNDigits(str, n) {
  if (n <= 0) return 0
  let seen = 0
  for (let i = 0; i < str.length; i++) {
    if (/[0-9]/.test(str[i])) {
      seen++
      if (seen === n) return i + 1
    }
  }
  return str.length
}

export default function NumberInput({
  value,
  onChange,
  locale = 'id-ID',
  currency = 'IDR',
  decimals,
  allowNegative = false,
  placeholder,
  disabled = false,
  className = '',
  inputClassName = '',
  id,
  name,
  required = false,
  ariaLabel,
  tabIndex,
}) {
  const seps = useMemo(() => resolveSeparators(locale), [locale])
  const effectiveDecimals = useMemo(
    () => resolveDecimals({ decimals, locale, currency }),
    [decimals, locale, currency]
  )
  const symbol = useMemo(() => resolveCurrencySymbol(locale, currency), [locale, currency])

  const [display, setDisplay] = useState(() =>
    numberToDisplay(value, { ...seps, decimals: effectiveDecimals })
  )

  const lastEmittedRef = useRef(value)
  useEffect(() => {
    if (value === lastEmittedRef.current) return
    setDisplay(numberToDisplay(value, { ...seps, decimals: effectiveDecimals }))
    lastEmittedRef.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, effectiveDecimals, seps.decimal, seps.group])

  const inputRef = useRef(null)
  const pendingCaretRef = useRef(null)
  useEffect(() => {
    if (pendingCaretRef.current != null && inputRef.current) {
      const pos = pendingCaretRef.current
      const clamped = Math.min(Math.max(pos, 0), inputRef.current.value.length)
      inputRef.current.setSelectionRange(clamped, clamped)
      pendingCaretRef.current = null
    }
  }, [display])

  function handleChange(e) {
    const rawNext = e.target.value
    const caretBefore = e.target.selectionStart ?? rawNext.length

    const charJustTyped = caretBefore > 0 ? rawNext.charAt(caretBefore - 1) : ''
    const userTypedDecimal = effectiveDecimals > 0 && charJustTyped === seps.decimal

    let normalized = rawNext
    let negative = false
    if (allowNegative && normalized.startsWith('-')) {
      negative = true
      normalized = normalized.slice(1)
    }

    const decIdxInNormalized = effectiveDecimals > 0 ? normalized.indexOf(seps.decimal) : -1

    let intPartRaw
    let fracPartRaw = null
    if (decIdxInNormalized === -1) {
      intPartRaw = normalized
    } else {
      intPartRaw = normalized.slice(0, decIdxInNormalized)
      fracPartRaw = normalized.slice(decIdxInNormalized + seps.decimal.length)
    }

    const negOffset = allowNegative && rawNext.startsWith('-') ? 1 : 0
    const decIdxInRaw = decIdxInNormalized === -1 ? -1 : decIdxInNormalized + negOffset

    let caretSide
    let digitsBeforeCaretOnSide
    if (decIdxInRaw === -1 || caretBefore <= decIdxInRaw) {
      const cutoff = decIdxInRaw === -1 ? caretBefore : Math.min(caretBefore, decIdxInRaw)
      digitsBeforeCaretOnSide = countDigitsBefore(rawNext, cutoff)
      caretSide = 'int'
    } else {
      let count = 0
      for (let i = decIdxInRaw + seps.decimal.length; i < caretBefore && i < rawNext.length; i++) {
        if (/[0-9]/.test(rawNext.charAt(i))) count++
      }
      digitsBeforeCaretOnSide = count
      caretSide = 'frac'
    }

    const intDigits = intPartRaw.replace(/\D/g, '')
    const grouped = groupInteger(intDigits, seps.group)

    let next
    if (fracPartRaw === null) {
      next = (negative ? '-' : '') + grouped
    } else {
      const fracDigits = fracPartRaw.replace(/\D/g, '').slice(0, effectiveDecimals)
      const intDisplay = grouped || '0'
      next = (negative ? '-' : '') + intDisplay + seps.decimal + fracDigits
    }

    let caretIdx
    if (userTypedDecimal && caretSide === 'int') {
      const decPos = next.indexOf(seps.decimal)
      caretIdx = decPos !== -1 ? decPos + seps.decimal.length : next.length
    } else if (caretSide === 'int') {
      const decPos = next.indexOf(seps.decimal)
      const intSection = decPos === -1 ? next : next.slice(0, decPos)
      caretIdx = findIndexAfterNDigits(intSection, digitsBeforeCaretOnSide)
    } else {
      const decPos = next.indexOf(seps.decimal)
      if (decPos === -1) {
        caretIdx = next.length
      } else {
        const fracStart = decPos + seps.decimal.length
        const fracSection = next.slice(fracStart)
        const offsetInFrac = findIndexAfterNDigits(fracSection, digitsBeforeCaretOnSide)
        caretIdx = fracStart + offsetInFrac
      }
    }

    commit(next, caretIdx)
  }

  function commit(nextDisplay, caretIdx) {
    pendingCaretRef.current = caretIdx
    setDisplay(nextDisplay)
    const num = displayToNumber(nextDisplay, seps)
    lastEmittedRef.current = num
    if (onChange) onChange(num)
  }

  function handleKeyDown(e) {
    if (!allowNegative && e.key === '-') e.preventDefault()
    if (effectiveDecimals === 0 && (e.key === '.' || e.key === ',')) e.preventDefault()
  }

  const hasSymbol = !!symbol

  return (
    <div className={`relative ${className}`}>
      {hasSymbol && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted select-none"
          aria-hidden="true"
        >
          {symbol}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        id={id}
        name={name}
        required={required}
        aria-label={ariaLabel}
        tabIndex={tabIndex}
        className={
          'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 tabular ' +
          'text-text placeholder:text-faint ' +
          'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft ' +
          'disabled:opacity-50 disabled:cursor-not-allowed ' +
          (hasSymbol ? 'pl-10 ' : '') +
          inputClassName
        }
      />
    </div>
  )
}
