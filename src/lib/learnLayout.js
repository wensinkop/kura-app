// Learn a reusable PDF layout from an AI read, so future statements of the same
// bank format are read by the deterministic parser — no AI, no cost.
//
// detectPdfLayout already finds the date column reliably; what trips it up on
// some banks (e.g. BRI's Debet/Kredit/Saldo) is which money column is which.
// The AI told us each row's income/expense, so we use that to pin the debit and
// credit columns, then VERIFY the derived layout re-reads the current statement
// to the same totals before trusting it.

import { detectPdfLayout, parseAmount, parsePdfStatement } from './statement.js'

const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// Does the money string `s` parse (in either decimal style) to ≈ `amount`?
// Returns the decimal that matched, or null.
function moneyMatch(s, amount) {
  for (const dec of ['.', ',']) {
    const v = parseAmount(s, dec)
    if (Number.isFinite(v) && Math.abs(v - amount) <= Math.max(0.5, Math.abs(amount) * 0.001)) return dec
  }
  return null
}

function totalsClose(rows, aiRows) {
  if (!rows.length || rows.length < aiRows.length * 0.9) return false
  const sum = (arr, k) => arr.filter((r) => r.kind === k).reduce((acc, r) => acc + Math.abs(Number(r.amount) || 0), 0)
  const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01)
  return near(sum(rows, 'expense'), sum(aiRows, 'expense')) && near(sum(rows, 'income'), sum(aiRows, 'income'))
}

// Returns a savePdfMap-shaped layout, or null if we can't confidently learn it.
export function learnPdfLayout(lines, aiRows, targetCurrency) {
  if (!Array.isArray(lines) || !Array.isArray(aiRows) || aiRows.length < 2) return null

  let auto
  try { auto = detectPdfLayout(lines) || {} } catch { return null }
  const dateX = auto.dateX
  if (dateX == null) return null

  const debitXs = []
  const creditXs = []
  const decimals = []
  for (const tx of aiRows) {
    const amt = Number(tx.amount)
    if (!(amt > 0)) continue
    let found = null
    let dec = null
    outer:
    for (const l of lines) {
      for (const it of l.items) {
        if (it.x <= dateX + 25 || !/\d/.test(it.s)) continue
        const d = moneyMatch(it.s, amt)
        if (d) { found = it; dec = d; break outer }
      }
    }
    if (!found) continue
    decimals.push(dec)
    if (tx.kind === 'income') creditXs.push(found.x)
    else debitXs.push(found.x)
  }

  // Need a decent share of rows matched to a money column to trust the result.
  if (debitXs.length + creditXs.length < Math.max(2, Math.floor(aiRows.length * 0.6))) return null
  const decimal = decimals.filter((d) => d === ',').length > decimals.length / 2 ? ',' : '.'

  const debitX = median(debitXs)
  const creditX = median(creditXs)
  let layout
  if (debitX != null && creditX != null && Math.abs(debitX - creditX) > 12) {
    layout = { dateX, debitX, creditX, mode: 'debit_credit', balanceX: auto.balanceX ?? null, decimal, year: auto.year }
  } else {
    const amountX = median([...debitXs, ...creditXs])
    if (amountX == null) return null
    layout = {
      dateX, amountX, mode: 'single', balanceX: auto.balanceX ?? null,
      defaultKind: debitXs.length >= creditXs.length ? 'expense' : 'income', decimal, year: auto.year,
    }
  }

  // Only trust the layout if it re-reads THIS statement to the same totals.
  let check
  try { check = parsePdfStatement(lines, { ...layout, targetCurrency }) } catch { return null }
  if (!totalsClose(check.rows, aiRows)) return null
  return layout
}
