// Bank-statement converter (Chunk 6, premium). A full-screen, three-step flow:
//
//   1. Upload   — pick a CSV or PDF statement + the Kura account it belongs to.
//   2. Map      — confirm the auto-detected columns, date order and decimal
//                 separator, with a live preview. Remembered per bank layout.
//   3. Review   — edit the pre-filled rows (kind/date/amount/category/note) in
//                 the familiar entry cards, then save.
//
// The parsing is all in lib/statement.js (shared by CSV + PDF); PDF text
// extraction is in lib/pdfStatement.js (lazy-loaded). Rows insert via the same
// createTransactions path as the entry screen — the currency comes from the
// chosen account (the DB trigger enforces it), kind is inferred from the sign.
//
// Premium: gated at the route in App.jsx via <PremiumGate> (Chunk 8). Free users
// never reach this component — they see the upgrade screen instead. Billing is
// manual/admin-granted for now (an admin flips subscription_tier).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { listAccounts, listGroups, listCategories, createTransactions, recentNotes, getAccountBalances, createImportBatch, setImportBatchCount, undoImport } from '../lib/data'
import {
  parseStatementText, analyzeGrid, buildStatementRows, parseDate, layoutSignature, parsePdfStatement, reconcilePdf, statementFingerprint, detectNumberFormat,
} from '../lib/statement'
import { extractPdfText } from '../lib/pdfStatement'
import { localeFor, currencyDecimals } from '../lib/currencies'
import { formatMoney, dayLabel } from '../lib/format'
import NumberInput from '../components/NumberInput'
import ResponsiveSelect from '../components/ResponsiveSelect'
import AutocompleteInput from '../components/AutocompleteInput'
import DatePicker from '../components/DatePicker'
import Sidebar from '../components/Sidebar'
import { Button, Field, Segmented, TextInput, inputClass } from '../components/ui'
import { ChevronLeft, UploadIcon } from '../lib/icons'

const KIND_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]
const DATE_FORMAT_OPTIONS = [
  { value: 'dmy', label: 'Day / Month / Year — 31/12/2026' },
  { value: 'mdy', label: 'Month / Day / Year — 12/31/2026' },
  { value: 'ymd', label: 'Year / Month / Day — 2026-12-31' },
  { value: 'mon', label: 'Month name — 31 Dec 2026' },
]
const DECIMAL_OPTIONS = [
  { value: '.', label: '1,234.56' },
  { value: ',', label: '1.234,56' },
]

const uuid = () => crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

// ---- Remembered mappings (per bank layout, on this device) ------------------
const MAP_KEY = (sig) => `kura.stmtmap.${sig}`
function loadSavedMapping(sig) {
  try {
    const raw = localStorage.getItem(MAP_KEY(sig))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function saveMapping(sig, payload) {
  try { localStorage.setItem(MAP_KEY(sig), JSON.stringify(payload)) } catch { /* ignore quota/private mode */ }
}

// Taught PDF layouts, remembered per bank fingerprint. (v2: earlier single-only
// taught layouts are intentionally ignored — they predate debit/credit teaching.)
const PDFMAP_KEY = (fp) => `kura.pdfmap.v2.${fp}`
function loadPdfMap(fp) {
  try { const raw = fp && localStorage.getItem(PDFMAP_KEY(fp)); return raw ? JSON.parse(raw) : null } catch { return null }
}
function savePdfMap(fp, payload) {
  try { if (fp) localStorage.setItem(PDFMAP_KEY(fp), JSON.stringify(payload)) } catch { /* ignore */ }
}
function removePdfMap(fp) {
  try { if (fp) localStorage.removeItem(PDFMAP_KEY(fp)) } catch { /* ignore */ }
}

export default function BankStatement() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [accounts, setAccounts] = useState([])
  const [groups, setGroups] = useState([])
  const [categories, setCategories] = useState([])
  const [notes, setNotes] = useState([]) // recent notes for the review-step typeahead
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState('upload') // 'upload' | 'password' | 'map' | 'review'
  const [source, setSource] = useState('csv') // 'csv' | 'pdf'
  const [accountId, setAccountId] = useState('')
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')

  // CSV: parsed grid + editable mapping/formats
  const [analysis, setAnalysis] = useState(null) // { headers, cols, dataRows, ... }
  const [mapping, setMapping] = useState(null)
  const [formats, setFormats] = useState(null)
  const [sig, setSig] = useState('')
  const [usedSaved, setUsedSaved] = useState(false)

  // PDF: extracted lines + editable layout (auto: { year, decimal, defaultKind };
  // taught/remembered also carries { dateX, amountX, mode, balanceX }).
  const [pdfLines, setPdfLines] = useState(null)
  const [pdfLayout, setPdfLayout] = useState(null)
  const [pdfFp, setPdfFp] = useState('') // bank fingerprint
  const [usedTaught, setUsedTaught] = useState(false)

  // Teach mode
  const [teachStep, setTeachStep] = useState(null) // null | 'date' | 'amount' | 'direction'
  const [taught, setTaught] = useState({})

  // PDF password
  const [password, setPassword] = useState('')
  const [wrongPassword, setWrongPassword] = useState(false)
  const pendingBuffer = useRef(null) // pristine ArrayBuffer (we pass copies to pdf.js)

  // Review rows + save
  const [reviewRows, setReviewRows] = useState([])
  const [selected, setSelected] = useState(() => new Set()) // tempIds ticked for bulk save/remove
  const [saving, setSaving] = useState(false)
  const [savedStats, setSavedStats] = useState({ count: 0, income: 0, expense: 0 }) // accumulated across batched saves
  const [doneBalance, setDoneBalance] = useState(null) // account balance shown on the done step
  const [batchId, setBatchId] = useState(null) // import batch tag (so the save can be undone as a unit)
  const [undoing, setUndoing] = useState(false)
  const [undone, setUndone] = useState(false)

  const fileInput = useRef(null)

  useEffect(() => {
    Promise.all([listAccounts(), listGroups(), listCategories(), recentNotes()]).then(([a, g, c, n]) => {
      const active = (a.data ?? []).filter((x) => !x.archived)
      setAccounts(active)
      setGroups(g.data ?? [])
      setCategories((c.data ?? []).filter((x) => !x.archived))
      setNotes(n ?? [])
      if (active.length === 1) setAccountId(active[0].id)
      setLoading(false)
    })
  }, [])

  const accountOptions = useMemo(() => {
    const gName = new Map(groups.map((g) => [g.id, g.name]))
    const gSort = new Map(groups.map((g) => [g.id, g.sort_order]))
    return [...accounts]
      .sort((a, b) => {
        const ga = a.group_id ? gSort.get(a.group_id) ?? 0 : Infinity
        const gb = b.group_id ? gSort.get(b.group_id) ?? 0 : Infinity
        if (ga !== gb) return ga - gb
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}`, group: a.group_id ? gName.get(a.group_id) ?? 'Group' : 'Ungrouped' }))
  }, [accounts, groups])

  const account = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId])
  const currency = account?.currency ?? 'IDR'

  // ---- Step 1 → 2: read + analyse the file ---------------------------------
  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setReading(true)
    try {
      setFileName(file.name)
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      if (isPdf) {
        pendingBuffer.current = await file.arrayBuffer()
        await loadPdf(undefined)
      } else {
        const grid = parseStatementText(await file.text()).grid
        if (!grid.length) { setError('That file looks empty.'); return }
        const a = analyzeGrid(grid)
        setSource('csv')
        setAnalysis(a)
        const signature = layoutSignature(a.headers)
        setSig(signature)
        // Reuse a remembered mapping for this layout if its columns still fit.
        const saved = loadSavedMapping(signature)
        const fits = saved && (saved.mapping?.amount ?? -1) < a.cols.length &&
          (saved.mapping?.date ?? -1) < a.cols.length
        if (saved && fits && signature) {
          setMapping(saved.mapping); setFormats(saved.formats); setUsedSaved(true)
        } else {
          setMapping(a.mapping); setFormats(a.formats); setUsedSaved(false)
        }
        setStep('map')
      }
    } catch (err) {
      setError(err?.message ?? 'Couldn’t read that file.')
    } finally {
      setReading(false)
    }
  }

  // Extract + parse a PDF (pass a copy each time — pdf.js transfers the buffer
  // to its worker, which would neuter our pristine copy).
  async function loadPdf(pw) {
    const res = await extractPdfText(pendingBuffer.current.slice(0), pw)
    if (res.needsPassword) {
      setWrongPassword(!!res.wrongPassword)
      setStep('password')
      return
    }
    if (res.textLength < 10 || !res.lines.length) {
      setError('Couldn’t read any text from this PDF — it may be a scanned image. Try downloading the CSV export from your bank instead.')
      setStep('upload')
      return
    }
    const result = parsePdfStatement(res.lines, { targetCurrency: currency })
    const fp = statementFingerprint(res.lines)
    const saved = loadPdfMap(fp)
    const base = { year: result.layout.year ?? new Date().getFullYear(), decimal: result.layout.decimal ?? '.', defaultKind: 'expense' }
    setSource('pdf')
    setPdfLines(res.lines)
    setPdfFp(fp)
    if (saved) {
      // Re-read this statement with the layout taught for this bank before.
      setPdfLayout({ ...base, ...saved })
      setUsedTaught(true)
    } else {
      setPdfLayout(base)
      setUsedTaught(false)
    }
    setPassword('')
    setWrongPassword(false)
    setStep('map')
  }

  async function submitPassword() {
    if (!pendingBuffer.current || !password) return
    setError(''); setReading(true)
    try { await loadPdf(password) }
    catch (err) { setError(err?.message ?? 'Couldn’t open the PDF.') }
    finally { setReading(false) }
  }

  // ---- Teach mode: user shows Kura where the date & amount(s) are ----------
  function beginTeach() { setTaught({}); setTeachStep('date'); setStep('teach') }

  function onTeachToken(item) {
    if (teachStep === 'date') { setTaught((t) => ({ ...t, dateX: item.x })); setTeachStep('mode') }
    else if (teachStep === 'amount') { setTaught((t) => ({ ...t, amountX: item.x })); setTeachStep('direction') }
    else if (teachStep === 'debit') { setTaught((t) => ({ ...t, debitX: item.x })); setTeachStep('credit') }
    else if (teachStep === 'credit') {
      const decimal = decimalForColumns([taught.debitX, item.x])
      applyTaught({ dateX: taught.dateX, debitX: taught.debitX, creditX: item.x, mode: 'debit_credit', balanceX: null, decimal })
    }
  }

  function chooseTeachMode(m) { setTeachStep(m === 'single' ? 'amount' : 'debit') }

  function finishTeach(defaultKind) {
    const decimal = decimalForColumns([taught.amountX])
    applyTaught({ dateX: taught.dateX, amountX: taught.amountX, mode: 'single', balanceX: null, defaultKind, decimal })
  }

  // Detect the decimal style (1,234.56 vs 1.234,56) from the money values sitting
  // in the taught amount column(s) — auto-detection had nothing to go on if the
  // statement didn't parse, so we sample the column the user just pointed at.
  function decimalForColumns(xs) {
    const samples = []
    for (const l of pdfLines ?? []) {
      for (const it of l.items) {
        if (xs.some((x) => x != null && Math.abs(it.x - x) < 12) && /^\d[\d.,]*\d$/.test(it.s) && /[.,]/.test(it.s)) samples.push(it.s)
      }
    }
    return detectNumberFormat(samples).decimal
  }

  function applyTaught(layout) {
    savePdfMap(pdfFp, layout)
    setPdfLayout((l) => ({ ...l, ...layout }))
    setUsedTaught(true)
    setTeachStep(null)
    setStep('map')
  }

  // Forget a taught layout for this bank and go back to automatic reading.
  function forgetTaught() {
    removePdfMap(pdfFp)
    const result = parsePdfStatement(pdfLines, { targetCurrency: currency })
    setPdfLayout({ year: result.layout.year ?? new Date().getFullYear(), decimal: result.layout.decimal ?? '.', defaultKind: 'expense' })
    setUsedTaught(false)
  }

  // ---- Live preview (map step) ---------------------------------------------
  const built = useMemo(() => {
    if (!analysis || !mapping || !formats) return { rows: [], skipped: [] }
    return buildStatementRows(analysis, mapping, formats)
  }, [analysis, mapping, formats])

  const pdfResult = useMemo(() => {
    if (source !== 'pdf' || !pdfLines || !pdfLayout) return null
    return parsePdfStatement(pdfLines, { ...pdfLayout, targetCurrency: currency })
  }, [source, pdfLines, pdfLayout, currency])

  // Unified rows shown in the preview + carried into review.
  const previewRows = source === 'pdf' ? (pdfResult?.rows ?? []) : built.rows
  const previewSkipped = source === 'pdf' ? 0 : built.skipped.length

  // Auto-check the PDF parse against the statement's own totals (when present).
  const pdfRecon = useMemo(() => {
    if (source !== 'pdf' || !pdfLines || !pdfResult) return null
    return reconcilePdf(pdfLines, pdfResult.rows, pdfResult.layout)
  }, [source, pdfLines, pdfResult])

  const firstDateRaw = useMemo(() => {
    if (!analysis || !mapping) return ''
    for (const r of analysis.dataRows) {
      const c = (r[mapping.date] ?? '').trim()
      if (c) return c
    }
    return ''
  }, [analysis, mapping])
  const firstDateISO = firstDateRaw && formats ? parseDate(firstDateRaw, formats.dateFormat) : null

  const colOptions = useMemo(
    () => (analysis?.cols ?? []).map((c) => ({ value: String(c.index), label: c.header || `Column ${c.index + 1}` })),
    [analysis]
  )
  const colOptionsNone = useMemo(() => [{ value: '-1', label: '— none —' }, ...colOptions], [colOptions])

  const setMap = (patch) => setMapping((m) => ({ ...m, ...patch }))
  const setFmt = (patch) => setFormats((f) => ({ ...f, ...patch }))

  // ---- Step 2 → 3: confirm, build editable rows ----------------------------
  function startReview() {
    if (source === 'csv' && sig) saveMapping(sig, { mapping, formats })
    setReviewRows(previewRows.map((r) => ({
      tempId: uuid(), kind: r.kind, date: r.date, amount: r.amount, categoryId: '', subId: '', note: r.note,
      // transfer fields (used when the user switches a row to Transfer):
      otherAccountId: '', transferDir: r.kind === 'income' ? 'in' : 'out',
    })))
    setStep('review')
  }

  // ---- Review helpers ------------------------------------------------------
  const catOptionsFor = (kind) => categories.filter((c) => c.kind === kind && !c.parent_id).map((c) => ({ value: c.id, label: c.name }))
  const subsFor = (catId) => categories.filter((c) => c.parent_id === catId)
  function updateRow(id, patch) { setReviewRows((rs) => rs.map((r) => (r.tempId === id ? { ...r, ...patch } : r))) }
  function setRowKind(id, k) { updateRow(id, { kind: k, categoryId: '', subId: '' }) }
  function removeRow(id) {
    setReviewRows((rs) => rs.filter((r) => r.tempId !== id))
    setSelected((s) => { const n = new Set(s); n.delete(id); return n })
  }
  function clearAllNotes() { setReviewRows((rs) => rs.map((r) => ({ ...r, note: '' }))) }

  // ---- Selection (tick rows to bulk save / remove) -------------------------
  function toggleSelect(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const allSelected = reviewRows.length > 0 && selected.size === reviewRows.length
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(reviewRows.map((r) => r.tempId)))
  }

  const rowValid = (r) => r.date && r.amount > 0 && (r.kind !== 'transfer' || (r.otherAccountId && r.otherAccountId !== accountId))
  const validReview = reviewRows.length > 0 && reviewRows.every(rowValid)
  const selectedRows = reviewRows.filter((r) => selected.has(r.tempId))
  const selectedValid = selectedRows.length > 0 && selectedRows.every(rowValid)
  const reviewTotal = useMemo(() => reviewRows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [reviewRows])

  // A review row → the createTransactions payload (currency comes from the account).
  function rowPayload(r) {
    if (r.kind === 'transfer') {
      const out = r.transferDir !== 'in' // money leaving the statement account
      return {
        kind: 'transfer', date: r.date, amount: r.amount,
        to_amount: r.amount, // same-currency assumed on import; fix in edit if cross-currency
        account_id: out ? accountId : r.otherAccountId,
        to_account_id: out ? r.otherAccountId : accountId,
        note: (r.note ?? '').trim() || null,
      }
    }
    return {
      kind: r.kind, date: r.date, amount: r.amount, account_id: accountId,
      category_id: r.subId || r.categoryId || null, note: (r.note ?? '').trim() || null,
    }
  }

  // Save the given rows; on success drop them from the list (and leave the rest
  // to keep reviewing). When nothing is left, show a confirmation with the
  // account's resulting balance (rows may be saved over several batches, so the
  // saved totals accumulate).
  async function saveRows(rows, badMsg) {
    setError('')
    if (!rows.length) return
    if (!rows.every(rowValid)) { setError(badMsg); return }
    setSaving(true)

    // Open a batch on the first save of this session so every row (across
    // batched saves) is tagged and the whole import can be undone as a unit.
    let bid = batchId
    if (!bid) {
      const { data, error: bErr } = await createImportBatch(user.id, { source: 'bank-statement', label: fileName })
      if (bErr) { setError(bErr.message); setSaving(false); return }
      bid = data.id; setBatchId(bid)
    }

    const { error: err } = await createTransactions(user.id, rows.map((r) => ({ ...rowPayload(r), import_batch_id: bid })))
    if (err) { setError(err.message); setSaving(false); return }
    const savedIds = new Set(rows.map((r) => r.tempId))
    const remaining = reviewRows.filter((r) => !savedIds.has(r.tempId))
    const stats = {
      count: savedStats.count + rows.length,
      income: savedStats.income + rows.filter((r) => r.kind === 'income').reduce((s, r) => s + (Number(r.amount) || 0), 0),
      expense: savedStats.expense + rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + (Number(r.amount) || 0), 0),
    }
    setSavedStats(stats)
    setSelected(new Set())
    setSaving(false)
    if (remaining.length === 0) {
      await setImportBatchCount(bid, stats.count)
      const bal = await getAccountBalances()
      const b = (bal.data ?? []).find((x) => x.account_id === accountId)
      setDoneBalance(b ? Number(b.balance) : null)
      setStep('done')
      return
    }
    setReviewRows(remaining)
  }

  async function handleUndo() {
    if (!batchId) return
    setUndoing(true)
    const { error: err } = await undoImport(batchId)
    setUndoing(false)
    if (err) { setError(err.message); return }
    setUndone(true)
  }
  const saveAll = () => saveRows(reviewRows, 'Every row needs a date and an amount; transfers need a second account.')
  const saveSelected = () => saveRows(selectedRows, 'Selected rows need a date and an amount; transfers need a second account.')
  function removeSelected() {
    setReviewRows((rs) => rs.filter((r) => !selected.has(r.tempId)))
    setSelected(new Set())
  }

  // ---- Render --------------------------------------------------------------
  const noAccounts = !loading && accounts.length === 0

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 pt-[calc(0.625rem_+_env(safe-area-inset-top))] pb-2.5 flex items-center gap-2">
          <button onClick={onBack} aria-label="Back" className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="font-bold text-[15px] flex-1">Import bank statement</div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary border border-primary/40 rounded-full px-2 py-0.5">Premium</span>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4 desk:px-8 desk:py-6 w-full">
          {/* The review step lays each row out as a wide table like New Transaction;
              the upload/map/teach steps stay a narrower single-column form. */}
          <div className={`mx-auto ${step === 'review' ? 'desk:max-w-[1100px]' : 'max-w-[760px]'}`}>
            {error && (
              <div className="mb-4 rounded-xl border border-expense/40 bg-expense/10 px-3.5 py-3 text-[13.5px] text-expense">
                {error}
              </div>
            )}

            {loading ? (
              <p className="text-muted text-sm py-8 text-center">Loading…</p>
            ) : noAccounts ? (
              <div className="bg-surface border border-border rounded-[14px] p-6 text-center max-w-md mx-auto mt-6">
                <p className="text-sm text-muted mb-4">You need an account before importing a statement.</p>
                <Button onClick={() => navigate('/settings/accounts')}>Add an account</Button>
              </div>
            ) : step === 'upload' ? (
              renderUpload()
            ) : step === 'password' ? (
              renderPassword()
            ) : step === 'teach' ? (
              renderTeach()
            ) : step === 'map' ? (
              renderMap()
            ) : step === 'done' ? (
              renderDone()
            ) : (
              renderReview()
            )}
          </div>
        </main>

        {/* Save bar (review step only). With rows ticked it acts on the
            selection (save → into the app + off the list, or remove); with
            none ticked it saves everything. */}
        {step === 'review' && !loading && (
          <div className="shrink-0 bg-surface border-t border-border px-4 py-3 desk:px-8 flex items-center gap-2.5">
            {selected.size > 0 ? (
              <>
                <div className="flex-1 text-[13px] font-semibold text-muted">{selected.size} selected</div>
                <Button variant="ghost" onClick={removeSelected} disabled={saving}>Remove {selected.size}</Button>
                <Button onClick={saveSelected} disabled={saving || !selectedValid}>{saving ? 'Saving…' : `Save ${selected.size}`}</Button>
              </>
            ) : (
              <>
                <div className="flex-1 text-[13px] text-muted">
                  {reviewRows.length} row{reviewRows.length === 1 ? '' : 's'} · into {account?.name}
                  <div className="text-[17px] font-extrabold text-text tabular">{formatMoney(reviewTotal, currency)}</div>
                </div>
                <Button onClick={saveAll} disabled={saving || !validReview}>{saving ? 'Saving…' : `Save ${reviewRows.length}`}</Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // ---- Back navigation between steps ---------------------------------------
  function onBack() {
    if (step === 'done') { navigate('/'); return }
    if (step === 'review') { setStep('map'); return }
    if (step === 'teach') { setTeachStep(null); setStep('map'); return }
    if (step === 'map' || step === 'password') {
      setStep('upload'); setAnalysis(null); setPdfLines(null); setPassword(''); setWrongPassword(false); setError('')
      return
    }
    navigate('/settings')
  }

  // ---- Step renderers ------------------------------------------------------
  function renderUpload() {
    return (
      <div className="space-y-4">
        <p className="text-[13.5px] text-muted leading-relaxed">
          Turn a bank statement into ready-to-edit transactions. Choose the account it belongs to, then pick the statement file — a <strong>CSV</strong> or a text-based <strong>PDF</strong>. Kura reads the rows; you review and fix them before saving. Nothing is saved until you confirm.
        </p>
        <Field label="Which account is this statement for?">
          <ResponsiveSelect title="Account" placeholder="Choose an account…" value={accountId} onChange={setAccountId} options={accountOptions} />
        </Field>
        <Button onClick={() => fileInput.current?.click()} disabled={!accountId || reading} className="w-full">
          <UploadIcon className="w-[18px] h-[18px]" />
          {reading ? 'Reading…' : 'Choose statement file (CSV or PDF)…'}
        </Button>
        <input ref={fileInput} type="file" accept=".csv,text/csv,.pdf,application/pdf" className="hidden" onChange={onFile} />
        {!accountId && <p className="text-[12px] text-faint text-center">Pick the account first.</p>}
        <p className="text-[11.5px] text-faint leading-relaxed">
          Tip: a scanned (photo) PDF has no readable text — if your PDF doesn’t work, download the CSV export from your bank’s app or website instead.
        </p>
      </div>
    )
  }

  function renderPassword() {
    return (
      <div className="space-y-4 max-w-md mx-auto">
        <div className="text-[13.5px] text-muted leading-relaxed">
          <span className="font-semibold text-text">{fileName}</span> is password-protected. Enter the password your bank uses to open it — often your date of birth, account number or customer ID (check the email the statement came with). It’s used only on your device to unlock the file.
        </div>
        {wrongPassword && <div className="text-[13px] text-expense">That password didn’t work — try again.</div>}
        <Field label="PDF password">
          <TextInput type="password" value={password} autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPassword() }} />
        </Field>
        <Button onClick={submitPassword} disabled={!password || reading} className="w-full">
          {reading ? 'Opening…' : 'Open statement'}
        </Button>
      </div>
    )
  }

  function renderPdfConfirm() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] text-muted min-w-0 truncate">
            <span className="font-semibold text-text">{fileName}</span> → {account?.name}
          </div>
          <span className="text-[12px] text-faint shrink-0">{previewRows.length} found</span>
        </div>

        {usedTaught && (
          <div className="rounded-xl border border-primary/30 bg-primary-soft/40 px-3.5 py-2.5 text-[12.5px] text-muted flex items-center justify-between gap-3">
            <span>Using the settings you taught Kura for this bank.</span>
            <button onClick={forgetTaught} className="text-primary font-semibold shrink-0 hover:underline">Use automatic</button>
          </div>
        )}

        {previewRows.length === 0 && (
          <div className="rounded-xl border border-transfer/40 bg-transfer/10 px-3.5 py-3 text-[13px] text-transfer space-y-2.5">
            <div>
              <div className="font-semibold mb-1">Kura couldn’t read this layout on its own.</div>
              Show it where the data is — Kura will remember this bank for next time.
            </div>
            <Button onClick={beginTeach} className="w-full">Teach Kura to read this statement</Button>
          </div>
        )}

        {pdfRecon && previewRows.length > 0 && (
          pdfRecon.status === 'none' ? (
            <div className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-muted">
              Couldn’t auto-check this against the statement’s totals — please look over the rows below before saving.
            </div>
          ) : (
            <div className={`rounded-xl border px-3.5 py-3 text-[13px] ${pdfRecon.status === 'ok' ? 'border-income/40 bg-income/10 text-income' : 'border-transfer/50 bg-transfer/10 text-transfer'}`}>
              <div className="font-semibold">
                {pdfRecon.status === 'ok' ? 'Adds up — matches the statement’s own totals ✓' : 'Doesn’t match the statement’s totals — double-check before saving'}
              </div>
              <ul className="mt-1 text-[12px] space-y-0.5">
                {pdfRecon.checks.map((c, i) => (
                  <li key={i}>{c.ok ? '✓' : '✗'} {c.label}: {formatMoney(c.got, currency)}{!c.ok && <> vs statement {formatMoney(c.want, currency)}</>}</li>
                ))}
              </ul>
            </div>
          )
        )}

        <div className="bg-surface border border-border rounded-[14px] p-4 space-y-3.5">
          <div className="text-xs font-bold uppercase tracking-wide text-faint">Statement settings</div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Statement year" hint="Used when dates omit the year">
              <TextInput type="number" inputMode="numeric" value={pdfLayout?.year ?? ''}
                onChange={(e) => setPdfLayout((l) => ({ ...l, year: Number(e.target.value) || l.year }))} />
            </Field>
            <Field label="Amount style">
              <ResponsiveSelect title="Decimal separator" value={pdfLayout?.decimal ?? '.'}
                onChange={(v) => setPdfLayout((l) => ({ ...l, decimal: v }))} options={DECIMAL_OPTIONS} />
            </Field>
          </div>
          <p className="text-[11.5px] text-faint leading-relaxed">
            Kura read each transaction’s date, amount and whether it’s money in or out. You can check and fix everything, including the type, on the next screen.
          </p>
        </div>

        {/* Always offer teaching when some rows were read — the auto-parse may be
            wrong (missed rows, wrong column) even when the count isn't zero. */}
        {previewRows.length > 0 && (
          <button type="button" onClick={beginTeach}
            className="w-full text-center text-[12.5px] font-semibold text-primary hover:underline">
            Not reading this right? Teach Kura where the data is →
          </button>
        )}

        <Button onClick={startReview} disabled={previewRows.length === 0} className="w-full">
          Review {previewRows.length} transaction{previewRows.length === 1 ? '' : 's'} →
        </Button>
      </div>
    )
  }

  // Teach mode: the user shows Kura where the date and amount(s) are. Handles a
  // single amount column or separate money-out / money-in columns.
  function renderTeach() {
    const prompts = {
      date: 'Tap the DATE of any one transaction below.',
      amount: 'Tap the AMOUNT of any transaction.',
      direction: 'For most rows, is the money going OUT or IN?',
      debit: 'Tap a MONEY-OUT amount (a payment, purchase or withdrawal row).',
      credit: 'Tap a MONEY-IN amount (a deposit, salary or refund row).',
    }
    const rows = (pdfLines ?? []).filter((l) => l.items.length > 1).slice(0, 90)
    const tappable = teachStep === 'date' || teachStep === 'amount' || teachStep === 'debit' || teachStep === 'credit'
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-primary/40 bg-primary-soft/50 px-3.5 py-3 text-[13.5px] text-text font-semibold">
          {teachStep === 'mode' ? 'How are the amounts shown on this statement?' : (prompts[teachStep] ?? '')}
        </div>

        {teachStep === 'mode' && (
          <div className="space-y-2">
            <Button variant="ghost" className="w-full" onClick={() => chooseTeachMode('single')}>One amount column</Button>
            <Button variant="ghost" className="w-full" onClick={() => chooseTeachMode('debit_credit')}>Separate money-out & money-in columns</Button>
          </div>
        )}
        {teachStep === 'direction' && (
          <div className="flex gap-2.5">
            <Button variant="ghost" className="flex-1" onClick={() => finishTeach('expense')}>Money out (expense)</Button>
            <Button variant="ghost" className="flex-1" onClick={() => finishTeach('income')}>Money in (income)</Button>
          </div>
        )}
        {tappable && (
          <p className="text-[12px] text-faint px-1">
            {taught.dateX != null && <span className="text-income font-semibold">✓ date</span>}
            {taught.debitX != null && <span className="text-income font-semibold"> · ✓ money-out</span>}
            {' '}Tap the matching value in any row — tokens are grouped just like the PDF.
          </p>
        )}

        {teachStep !== 'mode' && teachStep !== 'direction' && (
          <div className="bg-surface border border-border rounded-[14px] divide-y divide-border/60 max-h-[56dvh] overflow-y-auto">
            {rows.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-1.5 px-3 py-2">
                {l.items.map((it, j) => {
                  const picked = (teachStep !== 'date' && taught.dateX != null && Math.abs(it.x - taught.dateX) < 8) ||
                    (taught.debitX != null && Math.abs(it.x - taught.debitX) < 8)
                  return (
                    <button key={j} type="button" onClick={() => onTeachToken(it)}
                      className={`text-[12px] px-1.5 py-0.5 rounded border ${picked ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted hover:border-primary hover:text-primary'}`}>
                      {it.s}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        <Button variant="ghost" onClick={() => { setTeachStep(null); setStep('map') }} className="w-full">Cancel</Button>
      </div>
    )
  }

  function renderMap() {
    if (source === 'pdf') return renderPdfConfirm()
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] text-muted min-w-0 truncate">
            <span className="font-semibold text-text">{fileName}</span> → {account?.name}
          </div>
          <span className="text-[12px] text-faint shrink-0">{previewRows.length} ready · {previewSkipped} skipped</span>
        </div>

        {usedSaved && (
          <div className="rounded-xl border border-primary/30 bg-primary-soft/40 px-3.5 py-2.5 text-[12.5px] text-muted">
            Using the column settings you saved for this statement layout. Adjust below if needed.
          </div>
        )}

        <div className="bg-surface border border-border rounded-[14px] p-4 space-y-3.5">
          <div className="text-xs font-bold uppercase tracking-wide text-faint">Columns</div>

          <Field label="Date">
            <ResponsiveSelect title="Date column" value={String(mapping.date)} onChange={(v) => setMap({ date: Number(v) })} options={colOptions} />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Date format">
              <ResponsiveSelect title="Date format" value={formats.dateFormat} onChange={(v) => setFmt({ dateFormat: v })} options={DATE_FORMAT_OPTIONS} />
            </Field>
            <Field label="Amount style">
              <ResponsiveSelect title="Decimal separator" value={formats.decimal} onChange={(v) => setFmt({ decimal: v })} options={DECIMAL_OPTIONS} />
            </Field>
          </div>

          {firstDateRaw && (
            <div className={`text-[12px] rounded-lg px-3 py-2 ${formats.dateAmbiguous ? 'bg-transfer/10 text-transfer border border-transfer/30' : 'bg-surface-2 text-muted'}`}>
              {firstDateISO
                ? <>First date <strong>“{firstDateRaw}”</strong> reads as <strong>{dayLabel(firstDateISO)}</strong>. {formats.dateAmbiguous && 'If that’s wrong, switch the date format above.'}</>
                : <>Couldn’t read <strong>“{firstDateRaw}”</strong> as a date — try a different date format.</>}
            </div>
          )}

          <Field label="How are amounts shown?">
            <Segmented
              value={mapping.amountMode}
              onChange={(v) => setMap({ amountMode: v })}
              options={[{ value: 'single', label: 'One amount column' }, { value: 'debit_credit', label: 'Separate debit / credit' }]}
            />
          </Field>

          {mapping.amountMode === 'single' ? (
            <>
              <Field label="Amount column">
                <ResponsiveSelect title="Amount column" value={String(mapping.amount)} onChange={(v) => setMap({ amount: Number(v) })} options={colOptions} />
              </Field>
              <label className="flex items-center gap-2.5 text-[13px] text-muted cursor-pointer select-none">
                <input type="checkbox" checked={mapping.flipSign} onChange={(e) => setMap({ flipSign: e.target.checked })} className="w-4 h-4 accent-primary" />
                Money spent is shown as a positive number in my file
              </label>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Debit (money out)">
                <ResponsiveSelect title="Debit column" value={String(mapping.debit)} onChange={(v) => setMap({ debit: Number(v) })} options={colOptionsNone} />
              </Field>
              <Field label="Credit (money in)">
                <ResponsiveSelect title="Credit column" value={String(mapping.credit)} onChange={(v) => setMap({ credit: Number(v) })} options={colOptionsNone} />
              </Field>
            </div>
          )}

          <Field label="Description (becomes the note)">
            <ResponsiveSelect title="Description column" value={String(mapping.description)} onChange={(v) => setMap({ description: Number(v) })} options={colOptionsNone} />
          </Field>
        </div>

        <Button onClick={startReview} disabled={previewRows.length === 0} className="w-full">
          Review {previewRows.length} transaction{previewRows.length === 1 ? '' : 's'} →
        </Button>
      </div>
    )
  }

  function renderReview() {
    if (reviewRows.length === 0) {
      return (
        <div className="text-center py-10">
          <p className="text-sm text-muted mb-4">No rows left to import.</p>
          <Button variant="ghost" onClick={() => setStep('map')}>← Back to columns</Button>
        </div>
      )
    }
    const anyNotes = reviewRows.some((r) => (r.note ?? '').trim())
    return (
      <div>
        <p className="text-[13px] text-muted mb-3">
          Check each row, set a category if you like, and fix anything that looks off. Spending is an <span className="text-expense font-semibold">expense</span>, money in is <span className="text-income font-semibold">income</span> — change the type on any row. Tick rows to save or remove just those.
        </p>
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted cursor-pointer select-none">
            <input type="checkbox" checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allSelected }}
              onChange={toggleSelectAll} className="w-4 h-4 accent-primary" />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>
          {anyNotes && (
            <button type="button" onClick={clearAllNotes}
              className="text-[12px] font-semibold text-muted hover:text-expense">
              ✕ Clear all notes
            </button>
          )}
        </div>
        {reviewRows.map((row, idx) => {
          const subs = row.categoryId ? subsFor(row.categoryId) : []
          const isSel = selected.has(row.tempId)
          return (
            <div key={row.tempId} className={`bg-surface border rounded-[14px] p-3 mt-2.5 first:mt-0 ${isSel ? 'border-primary ring-1 ring-primary/30' : 'border-border'}`}>
              <div className="flex justify-between items-center mb-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={isSel} onChange={() => toggleSelect(row.tempId)} className="w-4 h-4 accent-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Row {idx + 1}</span>
                </label>
                <button type="button" onClick={() => removeRow(row.tempId)} className="text-xs text-faint hover:text-expense">✕ Remove</button>
              </div>
              <div className="grid grid-cols-2 gap-2.5 desk:flex desk:flex-wrap desk:items-end">
                <RField label="Type" deskW="desk:w-[120px] desk:flex-none">
                  <ResponsiveSelect title="Type" value={row.kind} onChange={(v) => setRowKind(row.tempId, v)} options={KIND_OPTIONS} />
                </RField>
                <RField label="Date" deskW="desk:w-[158px] desk:flex-none">
                  <DatePicker value={row.date} onChange={(v) => updateRow(row.tempId, { date: v })} className={inputClass} />
                </RField>
                <RField label="Amount" deskW="desk:w-[140px] desk:flex-none">
                  <NumberInput value={row.amount} onChange={(v) => updateRow(row.tempId, { amount: v })} locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
                </RField>
                {row.kind === 'transfer' ? (
                  <>
                    <RField label={row.transferDir === 'in' ? `Into ${account?.name} — from` : `Out of ${account?.name} — to`} full>
                      <ResponsiveSelect title="Other account" placeholder="Choose the other account…" value={row.otherAccountId}
                        onChange={(v) => updateRow(row.tempId, { otherAccountId: v })} options={accountOptions.filter((o) => o.value !== accountId)} />
                    </RField>
                    <RField label="Direction" deskW="desk:w-[150px] desk:flex-none">
                      <Segmented value={row.transferDir} onChange={(v) => updateRow(row.tempId, { transferDir: v })}
                        options={[{ value: 'out', label: 'Out' }, { value: 'in', label: 'In' }]} />
                    </RField>
                  </>
                ) : (
                  <>
                    <RField label="Category" full={subs.length === 0}>
                      <ResponsiveSelect title="Category" placeholder="— none —" noneLabel="— none —" value={row.categoryId} onChange={(v) => updateRow(row.tempId, { categoryId: v, subId: '' })} options={catOptionsFor(row.kind)} />
                    </RField>
                    {/* Stable sub-category column on desktop; hidden on mobile when empty. */}
                    <RField label="Sub-category" className={subs.length === 0 ? 'max-desk:hidden' : ''}>
                      {subs.length > 0 ? (
                        <ResponsiveSelect title="Sub-category" placeholder="— none —" noneLabel="— none —" value={row.subId} onChange={(v) => updateRow(row.tempId, { subId: v })} options={subs.map((s) => ({ value: s.id, label: s.name }))} />
                      ) : (
                        <div className={`${inputClass} flex items-center text-faint`} aria-hidden="true">—</div>
                      )}
                    </RField>
                  </>
                )}
                <RField label="Note" full deskW="desk:basis-full">
                  <div className="relative">
                    <AutocompleteInput
                      value={row.note ?? ''}
                      onChange={(v) => updateRow(row.tempId, { note: v })}
                      suggestions={notes}
                      placeholder="Note"
                      className={`${inputClass} ${row.note ? 'pr-9' : ''}`}
                    />
                    {row.note && (
                      <button type="button" onClick={() => updateRow(row.tempId, { note: '' })}
                        aria-label="Clear note"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-faint hover:text-expense hover:bg-surface-2">
                        ✕
                      </button>
                    )}
                  </div>
                </RField>
              </div>
            </div>
          )
        })}
        <div aria-hidden="true" className="h-[20dvh]" />
      </div>
    )
  }

  // ---- Done: confirmation + resulting balance after saving ------------------
  function renderDone() {
    if (undone) {
      return (
        <div className="max-w-md mx-auto text-center py-12 space-y-4">
          <div className="text-[15px] font-semibold text-text">Import undone.</div>
          <p className="text-[13px] text-muted">The {savedStats.count.toLocaleString()} transaction{savedStats.count === 1 ? '' : 's'} from this statement have been removed.</p>
          <Button onClick={() => navigate('/')} className="w-full">Done</Button>
        </div>
      )
    }
    return (
      <div className="max-w-md mx-auto py-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-income/15 text-income grid place-items-center text-2xl">✓</div>
          <div className="text-[18px] font-extrabold text-text">All saved</div>
          <p className="text-[13.5px] text-muted">
            <span className="font-semibold text-text">{savedStats.count.toLocaleString()}</span> transaction{savedStats.count === 1 ? '' : 's'} added to {account?.name}.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-faint px-4 pt-3 pb-1">Totals added</div>
          <div className="px-4 py-2.5">
            <div className="flex justify-between text-[13.5px]">
              <span className="text-muted">Income</span><span className="font-semibold text-income tabular">{formatMoney(savedStats.income, currency)}</span>
            </div>
            <div className="flex justify-between text-[13.5px] mt-0.5">
              <span className="text-muted">Expenses</span><span className="font-semibold text-expense tabular">{formatMoney(savedStats.expense, currency)}</span>
            </div>
          </div>
        </div>

        {doneBalance != null && (
          <div className="bg-surface border border-border rounded-[14px] px-4 py-3 flex justify-between items-baseline">
            <span className="text-[13.5px] text-muted truncate pr-3">{account?.name} balance now</span>
            <span className="text-[15px] font-extrabold text-text tabular shrink-0">{formatMoney(doneBalance, currency)}</span>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <Button onClick={() => navigate('/')} className="w-full">Looks good — done</Button>
          <Button variant="ghost" onClick={handleUndo} disabled={undoing} className="w-full">
            {undoing ? 'Undoing…' : 'Undo this import'}
          </Button>
        </div>
      </div>
    )
  }
}

// Review card field: label + control. `full` spans both mobile columns; `deskW`
// sizes it in the horizontal desktop row.
function RField({ label, full, deskW = 'desk:flex-1 desk:min-w-[150px]', className = '', children }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'col-span-2' : ''} ${deskW} ${className}`}>
      <label className="text-[10.5px] font-semibold text-muted pl-0.5">{label}</label>
      {children}
    </div>
  )
}
