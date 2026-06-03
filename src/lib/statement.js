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

// ---- PDF statement parsing (line/positional) --------------------------------
// Real bank PDFs aren't clean grids: one transaction spans several physical
// lines, dates often omit the year (it's in the statement period), money in/out
// is a KR/DB (kredit/debit) code rather than a sign, and sub-detail lines carry
// their own unrelated numbers. So instead of reconstructing a table we anchor
// each transaction on the line that *starts with a date*, attach the lines below
// it as description, and read the amount from the amount column (not the running
// balance, not the sub-line fees).
//
// `lines` is what pdfStatement.extractPdfText returns: [{ items: [{ s, x, y }] }]
// already grouped per row and sorted left-to-right.

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

// A token that reads as a date, with or without a year — numeric (01/05,
// 24/03/2026) or with a month name (01-APR, 13 Apr 2026). Returns {d, m, y|null}.
function pdfDateParts(s) {
  const t = (s ?? '').trim()
  const num = t.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/)
  if (num) {
    const d = +num[1], mo = +num[2]
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
    let y = num[3] ? +num[3] : null
    if (y != null && y < 100) y += 2000
    return { d, m: mo, y }
  }
  const nm = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})(?:[-\s](\d{2,4}))?$/)
  if (nm) {
    const mo = MONTHS[nm[2].slice(0, 3).toLowerCase()]
    const d = +nm[1]
    if (!mo || d < 1 || d > 31) return null
    let y = nm[3] ? +nm[3] : null
    if (y != null && y < 100) y += 2000
    return { d, m: mo, y }
  }
  return null
}
// A token that LOOKS like a monetary amount: digit groups with a thousands
// separator and/or a decimal part. Strict on purpose — it must reject reference
// codes (3004/FTSCY/WS95271), branch/CBG codes (0998) and phone numbers, which
// otherwise masquerade as numbers and steal the amount column.
function moneyLike(s) {
  const t = (s ?? '').trim()
  return /^\d[\d.,]*\d$/.test(t) && /[.,]/.test(t)
}

// Strip a trailing direction code (CR/KR = credit/in, DB/DR = debit/out) from an
// amount token like "28,658,672 CR". Returns { core, dir:'in'|'out'|null }.
function splitDir(s) {
  const m = (s ?? '').trim().match(/^(.*?)\s*\b(CR|KR|DB|DR)\b\.?$/i)
  if (m) return { core: m[1].trim(), dir: /^(CR|KR)$/i.test(m[2]) ? 'in' : 'out' }
  return { core: (s ?? '').trim(), dir: null }
}

// True when a token is a NON-ZERO money amount (ignoring a trailing CR/DR code).
// Zero placeholders ("0.00" in an empty debit/credit column) read as absent.
function nonZeroMoney(s) {
  const { core } = splitDir(s)
  return moneyLike(core) && /[1-9]/.test(core)
}

// Parse a money token to { value>0, dir } (or null), tolerating a CR/DR suffix.
function moneyToken(s, decimal) {
  const { core, dir } = splitDir(s)
  if (!moneyLike(core)) return null
  const v = parseAmount(core, decimal)
  if (v == null || v === 0) return null
  return { value: Math.abs(v), dir }
}

// Lines that are statement chrome, not transactions — repeated page headers and
// the end summary. Used to bound a transaction's continuation lines.
const PDF_NOISE = /BERSAMBUNG|SALDO\s*A(WAL|KHIR)|MUTASI\s*(CR|DB)|HALAMAN|PERIODE|TANGGAL\s+KETERANGAN|REKENING|MATA\s*UANG|CATATAN/i

// Decide a transaction's direction from its (Indonesian) description. The KR/CR
// (kredit) vs DB/DR (debit) code wins; otherwise a few unambiguous keywords —
// deposits & interest are money in, fees & tax & withdrawals are money out.
export function pdfKind(text, fallback = 'expense') {
  const t = ` ${text} `
  if (/\b(KR|CR)\b/i.test(t)) return 'income'
  if (/\b(DB|DR)\b/i.test(t)) return 'expense'
  if (/\b(PAJAK|BIAYA|ADM|ADMIN|TARIK)\b/i.test(t)) return 'expense'
  if (/\b(SETORAN|SETOR|BUNGA)\b/i.test(t)) return 'income'
  return fallback
}

// Cluster x positions into columns (gap-based). Returns [{ x, n }] ascending.
function clusterX(xs, gap = 25) {
  const s = [...xs].sort((a, b) => a - b)
  const out = []
  let cur = null
  for (const x of s) {
    if (cur && x - cur.last <= gap) { cur.sum += x; cur.n++; cur.last = x }
    else { cur = { sum: x, n: 1, last: x }; out.push(cur) }
  }
  return out.map((c) => ({ x: c.sum / c.n, n: c.n }))
}

// Auto-detect the statement's layout. Returns { year, dateX, decimal,
// mode:'single'|'debit_credit', amountX, debitX, creditX, balanceX }. The amount
// column is found from the money tokens on transaction lines; a running-balance
// column is told apart because it co-occurs with an amount to its left, whereas
// a separate credit column does not (credit rows carry only the credit). Two
// leftover money columns ⇒ separate debit/credit; one ⇒ a single amount column.
export function detectPdfLayout(lines) {
  const allText = lines.map((l) => l.items.map((i) => i.s).join(' ')).join('\n')
  const yearM = allText.match(/\b(20\d{2})\b/)
  const year = yearM ? +yearM[1] : null

  // Date column: the most common x of a leading date token.
  const dateXs = []
  for (const l of lines) {
    const f = l.items[0]
    if (f && pdfDateParts(f.s)) dateXs.push(f.x)
  }
  const dateX = median(dateXs)

  const lineMoney = [] // x positions of money tokens per transaction main line
  const amountSamples = []
  if (dateX != null) {
    for (const l of lines) {
      const f = l.items[0]
      if (!f || Math.abs(f.x - dateX) >= 15 || !pdfDateParts(f.s)) continue
      const money = l.items.filter((it) => it !== f && it.x > dateX + 25 && nonZeroMoney(it.s)).sort((a, b) => a.x - b.x)
      if (!money.length) continue
      lineMoney.push(money.map((m) => m.x))
      money.forEach((m) => amountSamples.push(splitDir(m.s).core))
    }
  }
  const decimal = detectNumberFormat(amountSamples).decimal

  const columns = clusterX(lineMoney.flat(), 25)

  // A column is the running balance if, on most lines where it appears, there's
  // a money token clearly to its left (the amount). Drop those.
  const isBalance = (cx) => {
    let total = 0, withLeft = 0
    for (const xs of lineMoney) {
      if (!xs.some((x) => Math.abs(x - cx) < 25)) continue
      total++
      if (xs.some((x) => x < cx - 60)) withLeft++
    }
    return total > 0 && withLeft / total >= 0.6
  }
  const balanceCols = columns.filter((c) => isBalance(c.x))
  const balanceX = balanceCols.length ? balanceCols[balanceCols.length - 1].x : null
  const amountCols = columns.filter((c) => !balanceCols.includes(c)).sort((a, b) => a.x - b.x)

  // How many lines have exactly one (non-balance) money token, sitting at cx —
  // the signature of a debit-or-credit column (a single amount column is never
  // "alone" against a second amount column).
  const soleCount = (cx) => lineMoney.filter((xs) => {
    const nb = xs.filter((x) => balanceX == null || Math.abs(x - balanceX) >= 25)
    return nb.length === 1 && Math.abs(nb[0] - cx) < 25
  }).length

  let mode = 'single'
  let amountX = null
  let debitX = null
  let creditX = null
  const left = amountCols[0]
  const right = amountCols[amountCols.length - 1]
  if (amountCols.length >= 2 && soleCount(left.x) >= 1 && soleCount(right.x) >= 1) {
    mode = 'debit_credit'
    debitX = left.x
    creditX = right.x
  } else if (amountCols.length) {
    amountX = [...amountCols].sort((a, b) => b.n - a.n)[0].x // the busiest column
  } else {
    amountX = median(lineMoney.map((xs) => xs[0]))
  }
  return { year, dateX, decimal, mode, amountX, debitX, creditX, balanceX }
}

// Build transactions from PDF lines using a layout (auto-detected, then possibly
// user-overridden). Returns { rows:[{date, amount, kind, note}], skipped:[...],
// layout }. `xTol` is how close a number must sit to the amount column.
export function parsePdfStatement(lines, override = {}) {
  const auto = detectPdfLayout(lines)
  const layout = { ...auto, ...override }
  const { dateX, decimal, mode, balanceX } = layout
  const year = layout.year ?? new Date().getFullYear()
  const xTol = 40

  if (dateX == null || (mode === 'single' ? layout.amountX == null : layout.debitX == null)) {
    return { rows: [], skipped: [], layout }
  }

  // Index of the lines that start a transaction (a date at the date column).
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].items[0]
    if (f && Math.abs(f.x - dateX) < 15 && pdfDateParts(f.s)) starts.push(i)
  }

  // Currency sections: multi-currency statements (e.g. OCBC current accounts) list
  // transactions under "Currency Code : IDR / SGD / USD" headers. When importing
  // into an account of a known currency, keep only that section's transactions.
  const target = (override.targetCurrency ?? layout.targetCurrency ?? '').toUpperCase()
  const sectionCur = new Array(lines.length)
  let curSec = null
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].items.map((it) => it.s).join(' ').match(/Currency\s*Code\s*:?\s*([A-Za-z]{3})/i)
    if (m) curSec = m[1].toUpperCase()
    sectionCur[i] = curSec
  }
  const hasSections = sectionCur.some((c) => c != null)

  const near = (it, x) => x != null && Math.abs(it.x - x) < xTol
  const isBalance = (it) => near(it, balanceX)

  const rows = []
  const skipped = []
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k]
    if (hasSections && target && sectionCur[start] && sectionCur[start] !== target) continue
    const nextStart = k + 1 < starts.length ? starts[k + 1] : lines.length
    const main = lines[start]
    const dp = pdfDateParts(main.items[0].s)
    const y = dp.y ?? year
    const date = `${y}-${pad(dp.m)}-${pad(dp.d)}`

    // Non-zero money tokens on the main line, left to right, excluding the
    // balance; each may carry a trailing CR/DR direction code.
    const money = main.items.filter((it) => nonZeroMoney(it.s) && it.x > dateX + 25 && !isBalance(it)).sort((a, b) => a.x - b.x)

    // Amount + column-derived direction. In debit/credit layouts the column the
    // figure sits in tells the direction; in single-column layouts the amount is
    // the (left-most) money token and direction comes from a CR/DR code or the
    // description below.
    let amtItem = null
    let colKind = null
    if (mode === 'debit_credit') {
      const deb = money.find((it) => near(it, layout.debitX))
      const cre = money.find((it) => near(it, layout.creditX))
      if (deb) { amtItem = deb; colKind = 'expense' }
      else if (cre) { amtItem = cre; colKind = 'income' }
    } else {
      amtItem = money.find((it) => near(it, layout.amountX)) ?? money[0]
    }
    const tok = amtItem ? moneyToken(amtItem.s, decimal) : null
    if (!tok) continue // balance-only marker (SALDO AWAL/AKHIR) or noise — skip
    const amount = tok.value

    // Continuation lines belong to this transaction until the next one — but
    // stop at a page break or a header/footer line (statements repeat the
    // header per page and print a summary at the end).
    let stop = start + 1
    while (stop < nextStart) {
      const l = lines[stop]
      if (main.page != null && l.page != null && l.page !== main.page) break
      if (PDF_NOISE.test(l.items.map((i) => i.s).join(' '))) break
      stop++
    }

    // Kind: the debit/credit column wins; else a CR/DR code on the amount token;
    // else the main line's KR/CR vs DB/DR code, keywords, then the layout default.
    const mainText = main.items.map((i) => i.s).join(' ')
    const kind = colKind
      ?? (tok.dir === 'in' ? 'income' : tok.dir === 'out' ? 'expense' : pdfKind(mainText, layout.defaultKind ?? 'expense'))

    // Description = the readable tokens across main + continuation lines (drop
    // the date, the amount/balance figures, the in/out codes and dup sub-amounts).
    const noteParts = []
    for (let j = start; j < stop; j++) {
      for (const it of lines[j].items) {
        if (pdfDateParts(it.s) && it === lines[j].items[0]) continue
        if (moneyLike(splitDir(it.s).core)) continue
        if (/^(DB|CR|DR|KR)$/i.test(it.s) || /^TANGGAL\s*:/i.test(it.s) || /^-+$/.test(it.s)) continue
        noteParts.push(it.s)
      }
    }
    const note = noteParts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 140)

    rows.push({ date, amount, kind, note })
  }
  return { rows, skipped, layout }
}
