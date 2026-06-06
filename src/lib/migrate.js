// App-migration adapters (Session 13). Turn another expense tracker's export
// into reviewable Kura rows, so switching to Kura is painless.
//
// Two paths share one intermediate row shape (below) and one downstream import
// (data.js importMigration):
//   • Money Manager (Realbyte) — auto-detected and fully mapped, incl. its
//     single-row transfers (the "Category" column holds the destination
//     account) and Excel serial dates.
//   • Generic column-mapper — for any other CSV/xlsx: reuses the statement
//     converter's column-detection engine (lib/statement.js) and adds account /
//     category / type columns, so Money Lover / Wallet / Spendee / Mint exports
//     work by pointing Kura at the right columns.
//
// Pure string/number work only (no DB, no React). The page reads the file into
// a string[][] grid (CSV via parseStatementText, xlsx via lib/xlsx readXlsxGrid)
// and passes the grid here; account creation + inserts happen in data.js.
//
// Intermediate row:
//   { date:'YYYY-MM-DD', type:'income'|'expense'|'transfer', amount:number>0,
//     account:string, toAccount:string|null, category:string|null,
//     subCategory:string|null, note:string|null, currency:string|null }

import {
  parseDate, parseAmount, detectHeaderRow, buildColumns,
  autoDetectMapping, detectDateFormat, detectNumberFormat,
} from './statement'
import { serialToISO } from './xlsx'

const norm = (s) => (s ?? '').trim().toLowerCase()

// ---- Date coercion ----------------------------------------------------------
// The xlsx reader already hands dates back as ISO. This also covers the CSV-
// export case (a Money Manager CSV may carry "MM/dd/yyyy" or a bare serial).
function toISODate(raw, preferred = 'mdy') {
  const t = (raw ?? '').trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Number(t)
    if (n > 20000 && n < 80000) return serialToISO(n)
  }
  return parseDate(t, preferred) || parseDate(t, 'dmy') || parseDate(t, 'ymd') || null
}

// ---- Type normalisation -----------------------------------------------------
function normType(s) {
  const t = norm(s)
  if (/transfer/.test(t)) return 'transfer'
  if (t === 'income' || t === 'in' || /pemasukan|masuk|deposit|\bcredit\b|kredit/.test(t)) return 'income'
  if (t === 'expense' || t === 'out' || /pengeluaran|keluar|\bdebit\b|debet/.test(t)) return 'expense'
  return null
}

// ============================================================================
//  Source detection
// ============================================================================

// Money Manager (Realbyte): header row carries Date / Account / Category /
// Subcategory / (main-currency) / Income/Expense / Description / Amount /
// Currency. The 6th header is the user's main-currency CODE so it varies — we
// key off the stable, distinctive headers instead.
export function detectSource(grid) {
  const headers = (grid?.[0] ?? []).map(norm)
  const has = (h) => headers.includes(h)
  if (has('income/expense') && has('subcategory') && has('account') && has('amount')) {
    return 'money-manager'
  }
  return 'generic'
}

// ============================================================================
//  Money Manager adapter
// ============================================================================

export function parseMoneyManager(grid) {
  const headers = (grid?.[0] ?? []).map(norm)
  const col = (name) => headers.indexOf(name)
  const ci = {
    date: col('date'),
    account: col('account'),     // first match (a duplicate trailing "Account" col is ignored)
    category: col('category'),
    sub: col('subcategory'),
    note: col('note'),
    type: col('income/expense'),
    desc: col('description'),
    amount: col('amount'),
    currency: col('currency'),
  }
  const cell = (row, i) => (i < 0 ? '' : (row[i] ?? '').trim())

  const rows = []
  const skipped = []
  const body = grid.slice(1)
  body.forEach((row, idx) => {
    const line = idx + 2 // +1 header, +1 to 1-based
    if (!row.some((c) => (c ?? '').trim() !== '')) return // blank line

    const date = toISODate(cell(row, ci.date), 'mdy')
    const amount = Math.abs(Number(cell(row, ci.amount)))
    const account = cell(row, ci.account)
    const typeRaw = norm(cell(row, ci.type))
    const type = normType(typeRaw)

    if (!type) { skipped.push({ line, reason: `unknown type "${cell(row, ci.type) || ''}"` }); return }
    if (!date) { skipped.push({ line, reason: `couldn't read date "${cell(row, ci.date) || ''}"` }); return }
    if (!Number.isFinite(amount) || amount <= 0) { skipped.push({ line, reason: `invalid amount "${cell(row, ci.amount) || ''}"` }); return }
    if (!account) { skipped.push({ line, reason: 'missing account' }); return }

    const note = cell(row, ci.note) || cell(row, ci.desc) || null
    const currency = cell(row, ci.currency) || null

    if (type === 'transfer') {
      // Money Manager writes a transfer as ONE row; the "Category" column holds
      // the OTHER account. Transfer-Out: this row's account is the source;
      // Transfer-In: it's the destination.
      const other = cell(row, ci.category)
      if (!other) { skipped.push({ line, reason: 'transfer is missing its other account' }); return }
      const isIn = /in\b/.test(typeRaw) // "transfer-in"
      rows.push({
        date, type: 'transfer', amount,
        account: isIn ? other : account,
        toAccount: isIn ? account : other,
        category: null, subCategory: null, note, currency,
      })
    } else {
      rows.push({
        date, type, amount, account, toAccount: null,
        category: cell(row, ci.category) || null,
        subCategory: cell(row, ci.sub) || null,
        note, currency,
      })
    }
  })
  return { rows, skipped }
}

// ============================================================================
//  Generic column-mapper (any other CSV/xlsx)
// ============================================================================

const ACCOUNT_HINTS = ['account', 'wallet', 'akun', 'rekening', 'dompet']
const TOACCOUNT_HINTS = ['to account', 'to_account', 'transfer to', 'destination', 'tujuan']
const CATEGORY_HINTS = ['category', 'kategori', 'categories']
const SUBCAT_HINTS = ['subcategory', 'sub-category', 'sub category', 'subkategori']
const TYPE_HINTS = ['type', 'income/expense', 'jenis', 'transaction type', 'dr/cr']
const CURRENCY_HINTS = ['currency', 'mata uang', 'curr', 'cur']

const headerHas = (header, hints) => { const h = norm(header); return hints.some((k) => h.includes(k)) }
function findCol(cols, hints) {
  for (const c of cols) if (headerHas(c.header, hints)) return c.index
  return -1
}

// Analyse a generic grid: header row, columns, an auto-guessed mapping (reusing
// the statement engine for date/amount/description, plus account/category/type
// guesses), and detected date/number formats. The UI shows these for editing.
export function analyzeGeneric(grid) {
  const headerRow = detectHeaderRow(grid)
  const { headers, cols, dataRows } = buildColumns(grid, headerRow)
  const base = autoDetectMapping(cols) // { date, description, amountMode, amount, debit, credit, flipSign }
  const mapping = {
    ...base,
    account: findCol(cols, ACCOUNT_HINTS),
    toAccount: findCol(cols, TOACCOUNT_HINTS),
    category: findCol(cols, CATEGORY_HINTS),
    subCategory: findCol(cols, SUBCAT_HINTS),
    type: findCol(cols, TYPE_HINTS),
    currency: findCol(cols, CURRENCY_HINTS),
  }
  const dateSamples = mapping.date >= 0 ? cols[mapping.date].samples : []
  const df = detectDateFormat(dateSamples)
  const amtIdx = [mapping.amount, mapping.debit, mapping.credit].filter((i) => i >= 0)
  const nf = detectNumberFormat(amtIdx.flatMap((i) => cols[i].samples))
  return {
    headerRow, headers, cols, dataRows, mapping,
    formats: { dateFormat: df.format, dateAmbiguous: df.ambiguous, decimal: nf.decimal },
  }
}

// Build intermediate rows from a generic mapping. `fallbackAccount` is the
// single account name to use when the file has no account column.
export function buildGenericRows({ dataRows }, mapping, formats, fallbackAccount = '') {
  const rows = []
  const skipped = []
  const cell = (cells, i) => (i == null || i < 0 ? '' : (cells[i] ?? '').trim())

  dataRows.forEach((cells, idx) => {
    const line = idx + 1
    if (!cells.some((c) => (c ?? '').trim() !== '')) return

    const date = toISODate(cell(cells, mapping.date), formats.dateFormat)

    let signed = null
    if (mapping.amountMode === 'debit_credit') {
      const deb = parseAmount(cell(cells, mapping.debit), formats.decimal)
      const cre = parseAmount(cell(cells, mapping.credit), formats.decimal)
      if (deb) signed = -Math.abs(deb)
      else if (cre) signed = Math.abs(cre)
    } else {
      signed = parseAmount(cell(cells, mapping.amount), formats.decimal)
    }
    if (mapping.flipSign && signed != null) signed = -signed

    const noDate = !date
    const noAmount = signed == null || signed === 0
    if (noDate && noAmount) return // blank/separator
    if (noDate) { skipped.push({ line, reason: `couldn't read a date` }); return }
    if (noAmount) { skipped.push({ line, reason: 'no amount on this row' }); return }

    // Type: an explicit column wins; else infer from the amount sign.
    const typeCol = mapping.type >= 0 ? normType(cell(cells, mapping.type)) : null
    const type = typeCol ?? (signed < 0 ? 'expense' : 'income')

    const account = cell(cells, mapping.account) || fallbackAccount
    if (!account) { skipped.push({ line, reason: 'no account (map an account column or pick one)' }); return }

    const note = cell(cells, mapping.description) || null
    const currency = cell(cells, mapping.currency) || null

    if (type === 'transfer') {
      const toAccount = cell(cells, mapping.toAccount) || null
      if (!toAccount) { skipped.push({ line, reason: 'transfer row has no destination account' }); return }
      rows.push({ date, type: 'transfer', amount: Math.abs(signed), account, toAccount, category: null, subCategory: null, note, currency })
    } else {
      rows.push({
        date, type, amount: Math.abs(signed), account, toAccount: null,
        category: cell(cells, mapping.category) || null,
        subCategory: cell(cells, mapping.subCategory) || null,
        note, currency,
      })
    }
  })
  return { rows, skipped }
}

// ============================================================================
//  Shared helpers (account collection + summary for the UI)
// ============================================================================

// Distinct account names referenced by the rows (source + transfer dest), with
// an inferred currency (the most common per-row currency seen for it) and a
// usage count. Drives the account-mapping step.
export function collectAccounts(rows) {
  const map = new Map() // name -> { name, count, curCounts:{cur:n} }
  const bump = (name, cur) => {
    if (!name) return
    const k = name.trim()
    if (!k) return
    let e = map.get(k)
    if (!e) { e = { name: k, count: 0, curCounts: {} }; map.set(k, e) }
    e.count++
    const c = (cur ?? '').trim().toUpperCase()
    if (c.length === 3) e.curCounts[c] = (e.curCounts[c] ?? 0) + 1
  }
  for (const r of rows) {
    bump(r.account, r.currency)
    if (r.toAccount) bump(r.toAccount, r.currency)
  }
  return [...map.values()]
    .map((e) => {
      const cur = Object.entries(e.curCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      return { name: e.name, count: e.count, currency: cur }
    })
    .sort((a, b) => b.count - a.count)
}

// Counts + per-currency totals for the large-import summary screen. Currency
// here is informational (the real currency comes from the mapped account).
export function summarize(rows) {
  const byType = { income: 0, expense: 0, transfer: 0 }
  const dates = []
  for (const r of rows) {
    byType[r.type] = (byType[r.type] ?? 0) + 1
    if (r.date) dates.push(r.date)
  }
  dates.sort()
  return {
    count: rows.length,
    byType,
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
  }
}
