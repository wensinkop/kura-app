// CSV export/import for Smara transactions, plus a Blob download helper.
//
// Pure string work only (no DB, no React) so it's easy to test by eye. The CSV
// uses Smara's own column set; importing the same file round-trips cleanly. We
// quote a field only when it needs it (comma, quote, or newline) and escape an
// embedded quote by doubling it — the standard CSV (RFC 4180) rules.

// Column order for the transactions CSV. `amount`/`to_amount` are raw numbers
// (not formatted money) so they re-parse exactly on import. Names (not ids) are
// used for account/category so the file is human-readable and portable.
export const TX_CSV_COLUMNS = [
  'date',
  'kind',
  'amount',
  'currency',
  'account',
  'to_account',
  'to_amount',
  'category',
  'sub_category',
  'note',
]

function escapeField(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// Build a CSV string from a header array + an array of row arrays.
export function toCSV(headers, rows) {
  const lines = [headers.map(escapeField).join(',')]
  for (const row of rows) lines.push(row.map(escapeField).join(','))
  return lines.join('\r\n')
}

// A rich transaction row (from listTransactionsInRange / *Full, with embedded
// account/to_account/category) -> a flat array matching TX_CSV_COLUMNS.
// `catById` resolves a category's parent name when the charge is on a
// sub-category (category embed only carries parent_id, not the parent's name).
export function txToCSVRow(t, catById) {
  let category = ''
  let subCategory = ''
  const cat = t.category
  if (cat) {
    if (cat.parent_id) {
      category = catById.get(cat.parent_id)?.name ?? ''
      subCategory = cat.name
    } else {
      category = cat.name
    }
  }
  return [
    t.date ?? '',
    t.kind ?? '',
    t.amount ?? '',
    t.currency ?? '',
    t.account?.name ?? '',
    t.to_account?.name ?? '',
    t.to_amount ?? '',
    category,
    subCategory,
    t.note ?? '',
  ]
}

export function transactionsToCSV(transactions, catById) {
  return toCSV(
    TX_CSV_COLUMNS,
    transactions.map((t) => txToCSVRow(t, catById))
  )
}

// Parse CSV text into an array of field-arrays. Handles quoted fields with
// embedded commas, quotes ("") and newlines. Tolerates \n or \r\n line endings
// and skips a trailing blank line. Returns [] for empty input. `delimiter`
// defaults to a comma but can be ';' or a tab for foreign bank exports.
export function parseCSV(text, delimiter = ',') {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const s = text ?? ''
  // Strip a UTF-8 BOM if a spreadsheet app added one.
  const start = s.charCodeAt(0) === 0xfeff ? 1 : 0

  function endField() {
    row.push(field)
    field = ''
  }
  function endRow() {
    endField()
    rows.push(row)
    row = []
  }

  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delimiter) {
      endField()
    } else if (c === '\n') {
      endRow()
    } else if (c === '\r') {
      // swallow; the \n (if any) ends the row, otherwise a lone \r ends it
      if (s[i + 1] !== '\n') endRow()
    } else {
      field += c
    }
  }
  // Flush the last field/row unless the file ended on a clean newline.
  if (field !== '' || row.length > 0) endRow()
  return rows
}

// Parse a Smara-format transactions CSV into objects keyed by header name.
// Maps each data row against the header row (first non-empty row). Unknown
// extra columns are ignored; missing columns read as ''. Returns
// { rows: [{date, kind, amount, ...}], headers }.
export function parseTransactionsCSV(text) {
  const grid = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (grid.length === 0) return { rows: [], headers: [] }
  const headers = grid[0].map((h) => h.trim().toLowerCase())
  const rows = grid.slice(1).map((cells) => {
    const obj = {}
    headers.forEach((h, idx) => { obj[h] = (cells[idx] ?? '').trim() })
    return obj
  })
  return { rows, headers }
}

// Trigger a client-side file download (works on desktop + Android PWA). The
// anchor is created, clicked, and revoked synchronously inside the user gesture.
export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click has had a tick to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// A starter CSV users can open in Google Sheets / Excel to build an import: the
// exact header row plus one example of each kind (expense with a sub-category,
// income, and a transfer). The `currency` column is informational — on import
// the currency is taken from the account, so it can be left blank.
export function buildImportTemplate() {
  return toCSV(TX_CSV_COLUMNS, [
    ['2026-06-01', 'expense', '25000', 'IDR', 'Cash', '', '', 'Food', 'Eat out', 'Lunch'],
    ['2026-06-02', 'income', '5000000', 'IDR', 'Bank A', '', '', 'Salary', '', 'June salary'],
    ['2026-06-03', 'transfer', '100000', 'IDR', 'Bank A', 'Cash', '100000', '', '', 'Cash withdrawal'],
  ])
}

// "smara-transactions-2026-06-02.csv" — a stable, sortable, dated filename.
export function datedFilename(prefix, ext) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${prefix}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`
}
