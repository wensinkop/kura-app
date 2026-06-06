// Minimal .xlsx reader (Session 13, for app-migration imports). Turns the first
// worksheet of an Excel file into a plain string[][] grid — the same shape
// parseStatementText produces for CSV — so the migration adapters and the
// generic column-mapper (lib/migrate.js, lib/statement.js) can treat CSV and
// xlsx identically.
//
// We don't pull in a full spreadsheet library: an .xlsx is just a ZIP of XML,
// and expense-tracker exports (Money Manager, Money Lover, Wallet…) are flat,
// single-sheet, formula-free tables. So we lazy-load fflate (a tiny unzip) and
// read the parts we need by hand:
//   • xl/sharedStrings.xml  — the string pool (cells reference it by index)
//   • xl/styles.xml         — to tell which numeric cells are *dates*
//   • the first worksheet   — the actual cells
//
// Date cells are the one transform we must do: Excel stores a date as a serial
// number (e.g. 46149.48 = 2026-05-07) with a date *format* applied. We detect
// the date format from the cell's style and convert the serial to an ISO
// 'YYYY-MM-DD' string. Every other cell is returned as its raw text, so
// downstream Number()/parseAmount handles plain numbers and scientific notation
// ("4.582637E7") without us reformatting and risking precision loss.

let fflatePromise = null
function getFflate() {
  if (!fflatePromise) fflatePromise = import('fflate')
  return fflatePromise
}

const pad = (n) => String(n).padStart(2, '0')

// XML text unescape (entities a spreadsheet writer may emit).
function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&') // last, so we don't double-decode
}

// Excel serial number -> ISO date. The 1900 system counts days from
// 1899-12-30 (which makes 1970-01-01 = serial 25569, the anchor we use); the
// 1904 system (older Mac files) is offset by 1462 days. Computed in UTC so a
// time-of-day fraction never drifts the calendar day across a timezone.
export function serialToISO(serial, date1904 = false) {
  const s = date1904 ? serial + 1462 : serial
  const ms = Math.round((s - 25569) * 86400 * 1000)
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Built-in numFmt ids that are dates/times (ECMA-376 §18.8.30), plus the common
// locale date ids. Custom formats (id >= 164) are judged by their format code.
const BUILTIN_DATE_FMTS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
])

// A format code is a date format if, after removing quoted literals, escaped
// chars, bracketed parts ([$-409], [Red]) and the "General" keyword, it still
// contains a y/m/d/h/s token. Catches "MM/dd/yyyy", "d mmm yyyy", "h:mm", etc.
function isDateFormatCode(code) {
  if (!code) return false
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/general/gi, '')
  return /[ymdhs]/i.test(stripped)
}

// Parse styles.xml -> a Set of cellXfs indices that are date-formatted.
function parseDateStyles(stylesXml) {
  const dateStyleIdx = new Set()
  if (!stylesXml) return dateStyleIdx

  // Custom number formats: numFmtId -> format code.
  const customDate = new Set()
  const nf = /<numFmt\b[^>]*\bnumFmtId="(\d+)"[^>]*\bformatCode="([^"]*)"/g
  let m
  while ((m = nf.exec(stylesXml))) {
    if (isDateFormatCode(unescapeXml(m[2]))) customDate.add(Number(m[1]))
  }

  // cellXfs: the array transactions cells index into via their `s` attribute.
  const block = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (!block) return dateStyleIdx
  const xfs = block[1].match(/<xf\b[^>]*\/?>/g) ?? []
  xfs.forEach((xf, i) => {
    const idM = xf.match(/\bnumFmtId="(\d+)"/)
    const id = idM ? Number(idM[1]) : 0
    if (BUILTIN_DATE_FMTS.has(id) || customDate.has(id)) dateStyleIdx.add(i)
  })
  return dateStyleIdx
}

// Parse sharedStrings.xml -> array of plain strings (rich-text runs concatenated).
function parseSharedStrings(xml) {
  const out = []
  if (!xml) return out
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let m
  while ((m = siRe.exec(xml))) {
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
    let t
    const parts = []
    while ((t = tRe.exec(m[1]))) parts.push(t[1])
    out.push(unescapeXml(parts.join('')))
  }
  return out
}

// Column letters ("A","AB") -> 0-based index.
function colIndex(ref) {
  const letters = ref.replace(/[0-9]+/g, '')
  let n = 0
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64)
  return n - 1
}

// Find the first worksheet's path inside the zip, honouring workbook order +
// relationships; falls back to the conventional sheet1.xml.
function firstSheetPath(files) {
  try {
    const wb = strOf(files, 'xl/workbook.xml')
    const rels = strOf(files, 'xl/_rels/workbook.xml.rels')
    const firstSheet = wb?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)
    if (firstSheet && rels) {
      const rid = firstSheet[1]
      const rel = rels.match(new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`))
      if (rel) {
        const target = rel[1].replace(/^\//, '')
        return target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`
      }
    }
  } catch { /* fall through */ }
  const known = Object.keys(files).find((k) => /^xl\/worksheets\/sheet1\.xml$/i.test(k))
  return known ?? Object.keys(files).find((k) => /^xl\/worksheets\/.*\.xml$/i.test(k))
}

let decoder = null
function strOf(files, path) {
  const u8 = files[path]
  if (!u8) return null
  decoder = decoder ?? new TextDecoder('utf-8')
  return decoder.decode(u8)
}

// Read the first worksheet of an .xlsx (ArrayBuffer/Uint8Array) into a trimmed
// string[][] grid. Date cells become ISO strings; blank trailing rows dropped.
export async function readXlsxGrid(input) {
  const { unzipSync } = await getFflate()
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)

  let files
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('That file isn’t a readable Excel (.xlsx) workbook.')
  }

  const wbXml = strOf(files, 'xl/workbook.xml') ?? ''
  const date1904 = /date1904="(1|true)"/i.test(wbXml)
  const shared = parseSharedStrings(strOf(files, 'xl/sharedStrings.xml'))
  const dateStyles = parseDateStyles(strOf(files, 'xl/styles.xml'))

  const sheetPath = firstSheetPath(files)
  const sheetXml = sheetPath ? strOf(files, sheetPath) : null
  if (!sheetXml) throw new Error('Couldn’t find a worksheet in that Excel file.')

  const grid = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  // Capture each cell's opening-tag attributes + body, then read r/t/s from the
  // attribute string (attribute ORDER varies between writers, so a single
  // positional regex would silently miss t=/s=). Body is either <v>…</v> (a
  // shared-string index, number, or formula result) or an inline <is><t>…</t>.
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g

  let rm
  while ((rm = rowRe.exec(sheetXml))) {
    const cells = []
    let cm
    cellRe.lastIndex = 0
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1]
      const refM = attrs.match(/\br="([A-Z]+\d+)"/)
      if (!refM) continue
      const idx = colIndex(refM[1])
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      const sM = attrs.match(/\bs="(\d+)"/)
      const styleIdx = sM ? Number(sM[1]) : null
      const body = cm[2] ?? ''
      let value
      if (type === 's') {
        const vM = body.match(/<v>([\s\S]*?)<\/v>/)
        value = vM ? (shared[Number(vM[1])] ?? '') : ''
      } else if (type === 'inlineStr') {
        const tM = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)
        value = tM ? unescapeXml(tM[1]) : ''
      } else if (type === 'b') {
        const vM = body.match(/<v>([\s\S]*?)<\/v>/)
        value = vM && vM[1] === '1' ? 'TRUE' : 'FALSE'
      } else if (type === 'e') {
        value = '' // error cell -> blank
      } else {
        // number (default) or formula string result.
        const vM = body.match(/<v>([\s\S]*?)<\/v>/)
        const raw = vM ? unescapeXml(vM[1]) : ''
        if (raw !== '' && type !== 'str' && styleIdx != null && dateStyles.has(styleIdx) && Number.isFinite(Number(raw))) {
          value = serialToISO(Number(raw), date1904)
        } else {
          value = raw
        }
      }
      for (let i = cells.length; i < idx; i++) cells.push('')
      cells[idx] = value
    }
    grid.push(cells)
  }

  // Drop fully-blank rows (trailing styled-but-empty rows are common).
  return grid.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
}
