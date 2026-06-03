// PDF bank-statement text extraction (Chunk 6), built on pdf.js. We pull the
// positioned text items from each page and group them into lines by their y
// position — keeping each item's x so the parser (lib/statement.js,
// parsePdfStatement) can tell the date / amount / balance columns apart.
//
// Real statements aren't clean tables (one transaction spans several lines, the
// running balance is printed only now and then, money in/out is a KR/DB code),
// so we deliberately stop at "lines" here and let parsePdfStatement do the
// transaction logic. A scanned (image) PDF has no text — we report textLength 0
// and the caller shows a "try the CSV export" message. Encrypted statements
// (common for Indonesian e-statements) report needsPassword so the UI can ask.
//
// pdf.js is heavy, so it's loaded on demand (dynamic import) into its own chunk.

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

// Extract text from a PDF ArrayBuffer. Returns
// { lines, pageCount, textLength, needsPassword, wrongPassword }.
// `lines` is [{ page, y, items: [{ s, x, y }] }], each line's items sorted
// left-to-right and the lines top-to-bottom within each page. Pass `password`
// to open an encrypted PDF.
export async function extractPdfText(arrayBuffer, password) {
  const pdfjs = await getPdfjs()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer, password, isEvalSupported: false })

  let doc
  try {
    doc = await loadingTask.promise
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      // code 2 = a password was supplied but it was wrong.
      return { lines: [], pageCount: 0, textLength: 0, needsPassword: true, wrongPassword: e.code === 2 }
    }
    throw e
  }

  try {
    const lines = []
    let textLength = 0
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items = content.items
        .filter((it) => it.str && it.str.trim() !== '')
        .map((it) => ({ s: it.str.trim(), x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || it.height || 8 }))
      textLength += items.reduce((a, it) => a + it.s.length, 0)
      // Group into lines top-to-bottom (pdf y grows upward); within a line keep
      // a running y so slight drift across a row still groups together.
      items.sort((a, b) => b.y - a.y || a.x - b.x)
      let cur = null
      for (const it of items) {
        const tol = Math.max(2, it.h * 0.6)
        if (cur && Math.abs(cur.y - it.y) <= tol) { cur.items.push(it); cur.y = it.y }
        else { cur = { page: p, y: it.y, items: [it] }; lines.push(cur) }
      }
      page.cleanup()
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x)
    return { lines, pageCount: doc.numPages, textLength, needsPassword: false, wrongPassword: false }
  } finally {
    // destroy() lives on the loading task in pdf.js v6; never let a cleanup
    // hiccup throw away a good result.
    try { await loadingTask.destroy() } catch { /* ignore */ }
  }
}
