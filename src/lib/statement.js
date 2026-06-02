// Generic bank-statement parsing engine (Chunk 6). Turns an arbitrary bank CSV
// (or a grid reconstructed from a PDF) into reviewable Kura rows: detect the
// delimiter + header row, guess which column is the date / description /
// amount (or debit+credit), detect the date order (DD/MM vs MM/DD) and the
// decimal separator, then build {date, amount, kind, note} rows from a mapping.
//
// Pure string/number work only (no DB, no React) so it's testable by eye and
// the UI can re-run buildStatementRows live as the user adjusts the mapping.

import { parseCSV } from './csv'

const pad = (n) => String(n).padStart(2, '0')
const frac = (arr, pred) => (arr.length ? arr.filter(pred).length / arr.length : 0)

// ---- Header-name hints (English + Indonesian, lowercased substrings) --------
const DATE_HINTS = ['date', 'tanggal', 'tgl', 'waktu', 'posting', 'value dt']
const DEBIT_HINTS = ['debit', 'debet', 'withdrawal', 'paid out', 'keluar', 'pengeluaran', 'out']
const CREDIT_HINTS = ['credit', 'kredit', 'deposit', 'paid in', 'masuk', 'pemasukan', 'in']
const AMOUNT_HINTS = ['amount', 'jumlah', 'nominal', 'value', 'mutasi', 'total']
const DESC_HINTS = ['description', 'keterangan', 'narrative', 'detail', 'memo', 'note',
  'remark', 'uraian', 'transaction', 'particular', 'reference', 'name', 'payee']
const BALANCE_HINTS = ['balance', 'saldo', 'running']

// ---- Cell shape sniffers ----------------------------------------------------
export function looksDateLike(s) {
  const t = (s ?? '').trim()
  if (!t) return false
  return (
    /^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$/.test(t) ||
    /^\d{4}-\d{2}-\d{2}/.test(t) ||
    /^\d{1,2}[\s\-/][A-Za-z]{3,}[\s\-/]\d{2,4}$/.test(t) ||
    /^[A-Za-z]{3,}[\s\-/]\d{1,2},?[\s\-/]\d{2,4}$/.test(t)
  )
}

export function looksNumeric(s) {
  const t = (s ?? '').trim()
  if (!t) return false
  return /^[-+(]?\s*\d[\d.,\s]*\)?\s*(dr|cr)?$/i.test(t)
}

// ---- Delimiter detection ----------------------------------------------------
// Pick the delimiter that splits the first few lines most consistently. A
// quoted delimiter can skew the raw count, but across several lines the right
// delimiter still wins (and the real parse honours quotes).
export function detectDelimiter(text) {
  const lines = (text ?? '').split(/\r\n|\r|\n/).filter((l) => l.trim() !== '').slice(0, 8)
  let best = ','
  let bestScore = -1
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1)
    const total = counts.reduce((a, b) => a + b, 0)
    if (total === 0) continue
    const consistent = counts.length > 1 && counts.every((c) => c === counts[0])
    const score = total + (consistent ? 1000 : 0)
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

// Parse CSV/TSV text into a cleaned grid (blank lines dropped). Returns
// { grid, delimiter }. Pass a delimiter to override auto-detection.
export function parseStatementText(text, delimiter) {
  const d = delimiter || detectDelimiter(text)
  const grid = parseCSV(text, d)
    .map((r) => r.map((c) => (c ?? '').trim()))
    .filter((r) => r.some((c) => c !== ''))
  return { grid, delimiter: d }
}

// ---- Header-row detection ---------------------------------------------------
// Banks often prepend a few preamble lines (account no., period). The header is
// the non-data row immediately followed by data-shaped rows (a date-like + a
// numeric cell). Returns -1 when the data starts at the very first row (no
// header). Falls back to 0.
export function detectHeaderRow(grid) {
  const isData = (r) => !!r && r.some(looksDateLike) && r.some(looksNumeric)
  if (isData(grid[0])) return -1
  const limit = Math.min(grid.length, 25)
  for (let i = 0; i < limit; i++) {
    if (isData(grid[i])) return Math.max(0, i - 1)
    if (isData(grid[i + 1])) {
      const hdr = grid[i]
      const nonEmpty = hdr.filter((c) => c !== '').length
      const numeric = hdr.filter(looksNumeric).length
      if (nonEmpty >= 1 && numeric <= nonEmpty / 2) return i
    }
  }
  return 0
}

// Split a grid at the header row into { headers, cols, dataRows }. headerRow=-1
// means there's no header (every row is data). Each col carries up to 30
// non-empty sample values for sniffing.
export function buildColumns(grid, headerRow) {
  const headers = headerRow >= 0 ? (grid[headerRow] ?? []) : []
  const dataRows = grid.slice(headerRow + 1)
  const width = Math.max(headers.length, ...dataRows.map((r) => r.length), 0)
  const cols = []
  for (let i = 0; i < width; i++) {
    const samples = dataRows.map((r) => (r[i] ?? '').trim()).filter(Boolean).slice(0, 30)
    cols.push({ index: i, header: (headers[i] ?? '').trim(), samples })
  }
  return { headers, cols, dataRows }
}

// ---- Column-role auto-detection --------------------------------------------
function headerHas(col, hints) {
  const h = col.header.toLowerCase()
  return hints.some((k) => h.includes(k))
}
function avgLen(col) {
  return col.samples.length ? col.samples.reduce((a, s) => a + s.length, 0) / col.samples.length : 0
}

// Guess the mapping. amountMode is 'debit_credit' when distinct debit & credit
// columns exist, else 'single'. Indices are -1 when nothing fits.
export function autoDetectMapping(cols) {
  const used = new Set()
  const claim = (i) => { if (i >= 0) used.add(i) }
  const free = (c) => !used.has(c.index)

  // Date: header hint wins, else the most date-like column.
  let date = bestIndex(cols.filter(free), (c) => (headerHas(c, DATE_HINTS) ? 2 : 0) + frac(c.samples, looksDateLike),
    (c) => headerHas(c, DATE_HINTS) || frac(c.samples, looksDateLike) > 0.5)
  claim(date)

  // Debit / credit columns (by header hint, must be numeric-ish).
  const debit = bestIndex(cols.filter((c) => free(c) && frac(c.samples, looksNumeric) > 0.3),
    (c) => (headerHas(c, DEBIT_HINTS) ? 1 : 0), (c) => headerHas(c, DEBIT_HINTS) && !headerHas(c, BALANCE_HINTS))
  claim(debit)
  const credit = bestIndex(cols.filter((c) => free(c) && frac(c.samples, looksNumeric) > 0.3),
    (c) => (headerHas(c, CREDIT_HINTS) ? 1 : 0), (c) => headerHas(c, CREDIT_HINTS) && !headerHas(c, BALANCE_HINTS))
  claim(credit)

  let amountMode = 'single'
  let amount = -1
  if (debit >= 0 && credit >= 0) {
    amountMode = 'debit_credit'
  } else {
    // Single signed amount: header hint, else a numeric column that isn't the
    // running balance. Avoid picking balance (header hint or last numeric col).
    const numeric = cols.filter((c) => free(c) && frac(c.samples, looksNumeric) > 0.5 && !headerHas(c, BALANCE_HINTS))
    amount = bestIndex(numeric, (c) => (headerHas(c, AMOUNT_HINTS) ? 2 : 0) + frac(c.samples, looksNumeric),
      () => true)
    // If a lone debit OR credit hint matched but not both, treat it as the
    // single amount column rather than dropping it.
    if (amount < 0 && (debit >= 0 || credit >= 0)) { amount = debit >= 0 ? debit : credit }
    claim(amount)
  }

  // Description: header hint, else the longest-text non-date, non-numeric column.
  const description = bestIndex(cols.filter(free),
    (c) => (headerHas(c, DESC_HINTS) ? 100 : 0) + (frac(c.samples, looksNumeric) < 0.3 && frac(c.samples, looksDateLike) < 0.3 ? avgLen(c) : 0),
    (c) => headerHas(c, DESC_HINTS) || (avgLen(c) >= 4 && frac(c.samples, looksNumeric) < 0.3))

  return { date, description, amountMode, amount, debit, credit, flipSign: false }
}

// Highest-scoring column index that also passes `eligible`, or -1.
function bestIndex(cols, score, eligible) {
  let best = -1
  let bestScore = -Infinity
  for (const c of cols) {
    if (!eligible(c)) continue
    const s = score(c)
    if (s > bestScore) { bestScore = s; best = c.index }
  }
  return best
}

// ---- Date parsing -----------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

function splitNumericDate(s) {
  const m = s.trim().match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

// "12 Jan 2026", "12-Jan-26", "Jan 12, 2026" -> {d,m,y} -> ISO. Returns null if
// it isn't a month-name date.
function parseMonthNameDate(s) {
  const t = s.trim().toLowerCase()
  let m = t.match(/^(\d{1,2})[\s\-/]([a-z]{3,})[\s\-/](\d{2,4})$/)
  if (m && MONTHS[m[2].slice(0, 3)]) return toISO(Number(m[3]), MONTHS[m[2].slice(0, 3)], Number(m[1]))
  m = t.match(/^([a-z]{3,})[\s\-/](\d{1,2}),?[\s\-/](\d{2,4})$/)
  if (m && MONTHS[m[1].slice(0, 3)]) return toISO(Number(m[3]), MONTHS[m[1].slice(0, 3)], Number(m[2]))
  return null
}

function toISO(y, m, d) {
  if (y < 100) y += 2000
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

// Detect the numeric date order from samples. 'ymd' if the first part is the
// 4-digit year; else look for an unambiguous day>12 (dmy) or month-position>12
// (mdy). When neither appears we can't be sure — default 'dmy' (most of the
// world incl. Indonesia) and flag `ambiguous` so the UI asks for confirmation.
export function detectDateFormat(samples) {
  const parts = samples.map(splitNumericDate).filter(Boolean)
  if (parts.length === 0) {
    // maybe month-name dates — unambiguous
    if (samples.some((s) => parseMonthNameDate(s))) return { format: 'mon', ambiguous: false }
    return { format: 'dmy', ambiguous: true }
  }
  if (parts.every((p) => p[0] > 31 || String(p[0]).length === 4)) return { format: 'ymd', ambiguous: false }
  let dmy = false
  let mdy = false
  for (const [a, b] of parts) {
    if (a > 12 && a <= 31) dmy = true
    if (b > 12 && b <= 31) mdy = true
  }
  if (dmy && !mdy) return { format: 'dmy', ambiguous: false }
  if (mdy && !dmy) return { format: 'mdy', ambiguous: false }
  return { format: 'dmy', ambiguous: true }
}

// Parse one date string with the chosen format -> ISO 'YYYY-MM-DD' or null.
// ISO and month-name inputs are recognised regardless of `format`.
export function parseDate(s, format) {
  const t = (s ?? '').trim()
  if (!t) return null
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const mn = parseMonthNameDate(t)
  if (mn) return mn
  const parts = splitNumericDate(t)
  if (!parts) return null
  let y, m, d
  if (format === 'ymd') [y, m, d] = parts
  else if (format === 'mdy') [m, d, y] = parts
  else [d, m, y] = parts // dmy (and 'mon' fallback)
  return toISO(y, m, d)
}

// ---- Amount parsing ---------------------------------------------------------
// Decide the decimal separator. With both '.' and ',' present, the rightmost is
// the decimal. With only one, it's the decimal when it's followed by 1-2 digits
// (e.g. "1234,56"); a 3-digit group means it's a thousands separator.
export function detectNumberFormat(samples) {
  let comma = 0
  let dot = 0
  for (const s of samples) {
    const hasC = s.includes(',')
    const hasD = s.includes('.')
    if (hasC && hasD) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) comma++; else dot++
    } else if (hasC) {
      if (/,\d{1,2}\b/.test(s) && !/,\d{3}\b/.test(s)) comma++; else dot++
    } else if (hasD) {
      if (/\.\d{1,2}\b/.test(s) && !/\.\d{3}\b/.test(s)) dot++; else comma++
    }
  }
  return { decimal: comma > dot ? ',' : '.' }
}

// Parse a money cell to a signed number (or null). Handles currency symbols/
// codes, thousands separators, parentheses-negatives and trailing DR/CR.
export function parseAmount(s, decimal = '.') {
  let t = (s ?? '').trim()
  if (!t) return null
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t) || /-\s*$/.test(t) || /\bdr\b/i.test(t)
  t = t.replace(/[()]/g, '').replace(/[^\d.,]/g, '')
  if (decimal === ',') t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  if (t === '' || t === '.') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

// ---- Tie it together --------------------------------------------------------
// Analyse a cleaned grid: header row, columns, an auto-guessed mapping, and the
// detected date/number formats. The UI shows these for confirmation.
export function analyzeGrid(grid) {
  const headerRow = detectHeaderRow(grid)
  const { headers, cols, dataRows } = buildColumns(grid, headerRow)
  const mapping = autoDetectMapping(cols)
  const dateSamples = mapping.date >= 0 ? cols[mapping.date].samples : []
  const df = detectDateFormat(dateSamples)
  const amtIdx = [mapping.amount, mapping.debit, mapping.credit].filter((i) => i >= 0)
  const numSamples = amtIdx.flatMap((i) => cols[i].samples)
  const nf = detectNumberFormat(numSamples)
  return {
    headerRow, headers, cols, dataRows, mapping,
    formats: { dateFormat: df.format, dateAmbiguous: df.ambiguous, decimal: nf.decimal },
  }
}

// Build the reviewable rows from a mapping + formats. Returns
// { rows:[{date, amount, kind, note}], skipped:[{line, reason}] }. Money out
// (negative / debit) -> expense, money in -> income. Lines that read as neither
// a date nor an amount are treated as blanks and silently dropped.
export function buildStatementRows({ dataRows }, mapping, formats) {
  const rows = []
  const skipped = []
  const cell = (cells, i) => (i == null || i < 0 ? '' : (cells[i] ?? '').trim())

  dataRows.forEach((cells, idx) => {
    const line = idx + 1
    const rawDate = cell(cells, mapping.date)
    const date = parseDate(rawDate, formats.dateFormat)

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

    const note = cell(cells, mapping.description)
    const noDate = !date
    const noAmount = signed == null || signed === 0

    if (noDate && noAmount) return // blank / separator / summary line
    if (noDate) { skipped.push({ line, reason: `couldn't read a date from "${rawDate || '(empty)'}"` }); return }
    if (noAmount) { skipped.push({ line, reason: 'no amount on this row' }); return }

    rows.push({ date, amount: Math.abs(signed), kind: signed < 0 ? 'expense' : 'income', note })
  })
  return { rows, skipped }
}

// A stable fingerprint of a statement's columns, so we can remember the user's
// confirmed mapping per bank layout (stored in localStorage by the page).
export function layoutSignature(headers) {
  return (headers ?? []).map((h) => (h ?? '').trim().toLowerCase()).join('|')
}
