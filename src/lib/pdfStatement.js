// PDF bank-statement text extraction (Chunk 6), built on pdf.js. We pull the
// positioned text items from each page, cluster them into lines by their y
// position, work out the column x-anchors that repeat across rows, and assign
// each item to its nearest column — reconstructing a table grid that the shared
// statement engine (lib/statement.js) can map exactly like a CSV grid.
//
// This is best-effort: it works on digital, text-based statements. A scanned
// (image) PDF has no extractable text — we detect that (textLength ~ 0) and the
// caller shows a "couldn't read a table, try the CSV export" message instead of
// inventing rows.
//
// pdf.js is heavy, so it's loaded on demand (dynamic import) — it only ships in
// its own chunk, fetched the first time someone converts a PDF.

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let pdfjsPromise = null
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerSrc = workerUrl
      return m
    })
  }
  return pdfjsPromise
}

// Group the column x positions into anchors. We sort every item's x and break a
// new column wherever the gap to the previous x exceeds the tolerance — so each
// visual column becomes one anchor regardless of how few rows use it (a "credit"
// column that appears on just a handful of rows must not be dropped).
function buildAnchors(lineItems) {
  const xs = []
  for (const items of lineItems) for (const it of items) xs.push(it.x)
  xs.sort((a, b) => a - b)
  const tol = 14
  const anchors = []
  let cluster = []
  const flush = () => { if (cluster.length) anchors.push(cluster.reduce((a, b) => a + b, 0) / cluster.length) }
  for (const x of xs) {
    if (cluster.length && x - cluster[cluster.length - 1] > tol) { flush(); cluster = [] }
    cluster.push(x)
  }
  flush()
  return anchors
}

function nearestAnchor(anchors, x) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < anchors.length; i++) {
    const d = Math.abs(anchors[i] - x)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

// Extract a table grid from a PDF ArrayBuffer. Returns
// { grid, pages, textLength }. `grid` is an array of cell-arrays (same shape as
// a parsed CSV) ready for analyzeGrid(); it's empty when no text was found.
export async function extractPdfGrid(arrayBuffer) {
  const pdfjs = await getPdfjs()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer, isEvalSupported: false })
  const doc = await loadingTask.promise
  try {
    const lines = []
    let textLength = 0
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items = content.items
        .filter((it) => it.str && it.str.trim() !== '')
        .map((it) => ({
          str: it.str.trim(),
          x: it.transform[4],
          y: it.transform[5],
          h: Math.abs(it.transform[3]) || it.height || 8,
        }))
      textLength += items.reduce((a, it) => a + it.str.length, 0)
      // Group into lines, top-to-bottom (pdf y grows upward).
      items.sort((a, b) => b.y - a.y || a.x - b.x)
      let cur = null
      for (const it of items) {
        const tol = Math.max(2, it.h * 0.6)
        if (cur && Math.abs(cur.y - it.y) <= tol) { cur.items.push(it); cur.y = it.y }
        else { cur = { y: it.y, items: [it] }; lines.push(cur) }
      }
      page.cleanup()
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x)

    if (textLength < 10 || lines.length === 0) {
      return { grid: [], pages: doc.numPages, textLength }
    }

    const anchors = buildAnchors(lines.map((l) => l.items))
    const grid = lines
      .map((l) => {
        const row = new Array(anchors.length).fill('')
        for (const it of l.items) {
          const i = nearestAnchor(anchors, it.x)
          row[i] = row[i] ? `${row[i]} ${it.str}` : it.str
        }
        return row.map((c) => c.trim())
      })
      .filter((r) => r.some((c) => c !== ''))

    return { grid, pages: doc.numPages, textLength }
  } finally {
    // Tear down the worker transport. Never let a cleanup hiccup discard a
    // good result. (destroy() lives on the loading task in pdf.js v6.)
    try { await loadingTask.destroy() } catch { /* ignore */ }
  }
}
