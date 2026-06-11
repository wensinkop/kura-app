// "Switch from another app" — import a whole history from another expense
// tracker (Session 13). Free feature; lowers the cost of leaving a competitor.
//
// Flow:
//   1. Upload   — pick a CSV or Excel export. Money Manager (Realbyte) is
//                 auto-detected; anything else falls to a column-mapping step.
//   2. Map      — (generic files only) point Smara at the right columns.
//   3. Accounts — for each account found in the file, Create a new Smara account
//                 (currency pre-filled) or Merge into an existing one.
//   4. Review   — small imports show editable rows; large imports show a
//                 summary + sample, then import in the background.
//   5. Done     — success, with one-tap "Undo this import" (every imported row
//                 is tagged with a batch id, so the whole import rolls back).
//
// Parsing lives in lib/migrate.js (+ lib/xlsx.js for Excel); inserts + account
// creation + the undoable batch live in data.js importMigration / undoImport.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { listAccounts, importMigration, undoImport, getAccountBalances } from '../lib/data'
import {
  detectSource, parseMoneyManager, analyzeGeneric, buildGenericRows,
  collectAccounts, summarize,
} from '../lib/migrate'
import { readXlsxGrid } from '../lib/xlsx'
import { parseStatementText } from '../lib/statement'
import { currencyOptions, localeFor, currencyDecimals } from '../lib/currencies'
import { formatMoney, dayLabel } from '../lib/format'
import ResponsiveSelect from '../components/ResponsiveSelect'
import DatePicker from '../components/DatePicker'
import NumberInput from '../components/NumberInput'
import Sidebar from '../components/Sidebar'
import { Button, Field, Segmented, TextInput, inputClass } from '../components/ui'
import { ChevronLeft, UploadIcon } from '../lib/icons'

const REVIEW_LIMIT = 150 // at or below this, rows are individually editable

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]
const ACCOUNT_TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'debit', label: 'Bank / Debit' },
  { value: 'credit_card', label: 'Credit card' },
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
const CREATE = '__create__'
const uuid = () => crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
const norm = (s) => (s ?? '').trim().toLowerCase()

export default function Migrate() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const baseCurrency = profile?.base_currency ?? 'IDR'

  const [accounts, setAccounts] = useState([]) // existing Smara accounts (merge targets)
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState('upload') // upload|map|accounts|review|importing|done
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [source, setSource] = useState('generic')

  // Generic mapping
  const [analysis, setAnalysis] = useState(null)
  const [mapping, setMapping] = useState(null)
  const [formats, setFormats] = useState(null)
  const [fallbackAccount, setFallbackAccount] = useState('')

  // Parsed rows + account plan
  const [rows, setRows] = useState([])
  const [skipped, setSkipped] = useState([])
  const [plan, setPlan] = useState({}) // sourceName -> { action, accountId, name, type, currency }

  // Import progress + result
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null)
  const [totals, setTotals] = useState([]) // [{ currency, income, expense }]
  const [balances, setBalances] = useState([]) // [{ name, currency, balance }]
  const [undoing, setUndoing] = useState(false)
  const [undone, setUndone] = useState(false)

  const fileInput = useRef(null)

  useEffect(() => {
    listAccounts().then((a) => {
      setAccounts((a.data ?? []).filter((x) => !x.archived))
      setLoading(false)
    })
  }, [])

  const foundAccounts = useMemo(() => collectAccounts(rows), [rows])
  const summary = useMemo(() => summarize(rows), [rows])
  const existingByName = useMemo(() => {
    const m = new Map()
    for (const a of accounts) m.set(norm(a.name), a)
    return m
  }, [accounts])

  // ---- Step 1: read + detect -----------------------------------------------
  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setReading(true)
    try {
      setFileName(file.name)
      const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes('sheet') || file.type.includes('excel')
      const grid = isXlsx
        ? await readXlsxGrid(await file.arrayBuffer())
        : parseStatementText(await file.text()).grid
      if (!grid.length) { setError('That file looks empty.'); return }

      const src = detectSource(grid)
      setSource(src)
      if (src === 'money-manager') {
        const { rows: r, skipped: sk } = parseMoneyManager(grid)
        if (!r.length) { setError('Couldn’t read any transactions from this Money Manager export.'); return }
        beginAccounts(r, sk)
      } else {
        const a = analyzeGeneric(grid)
        setAnalysis(a); setMapping(a.mapping); setFormats(a.formats)
        setStep('map')
      }
    } catch (err) {
      setError(err?.message ?? 'Couldn’t read that file.')
    } finally {
      setReading(false)
    }
  }

  // ---- Step 2 (generic): live preview + confirm ----------------------------
  const built = useMemo(() => {
    if (source !== 'generic' || !analysis || !mapping || !formats) return { rows: [], skipped: [] }
    return buildGenericRows(analysis, mapping, formats, fallbackAccount)
  }, [source, analysis, mapping, formats, fallbackAccount])

  const colOptions = useMemo(
    () => (analysis?.cols ?? []).map((c) => ({ value: String(c.index), label: c.header || `Column ${c.index + 1}` })),
    [analysis]
  )
  const colOptionsNone = useMemo(() => [{ value: '-1', label: '— none —' }, ...colOptions], [colOptions])
  const setMap = (patch) => setMapping((m) => ({ ...m, ...patch }))
  const setFmt = (patch) => setFormats((f) => ({ ...f, ...patch }))

  function confirmGeneric() {
    if (!built.rows.length) { setError('No rows could be read with these column choices.'); return }
    beginAccounts(built.rows, built.skipped)
  }

  // ---- Step 3: seed the account plan ---------------------------------------
  function beginAccounts(parsedRows, parsedSkipped) {
    setRows(parsedRows)
    setSkipped(parsedSkipped ?? [])
    const found = collectAccounts(parsedRows)
    const seed = {}
    for (const f of found) {
      const match = existingByName.get(norm(f.name))
      seed[f.name] = match
        ? { action: 'merge', accountId: match.id }
        : { action: 'create', name: f.name, type: 'debit', currency: f.currency ?? baseCurrency }
    }
    setPlan(seed)
    setError('')
    setStep('accounts')
  }

  const setPlanFor = (name, patch) => setPlan((p) => ({ ...p, [name]: { ...p[name], ...patch } }))

  const mergeOptions = useMemo(
    () => [{ value: CREATE, label: '➕ Create new account' },
      ...accounts.map((a) => ({ value: a.id, label: `Merge into ${a.name} · ${a.currency}` }))],
    [accounts]
  )

  // Currency that a source account will end up in (created currency or the
  // merged-into account's currency) — used to format amounts in review.
  function currencyForAccount(name) {
    const p = plan[name]
    if (!p) return baseCurrency
    if (p.action === 'merge') return accounts.find((a) => a.id === p.accountId)?.currency ?? baseCurrency
    return p.currency ?? baseCurrency
  }

  const accountsValid = foundAccounts.every((f) => {
    const p = plan[f.name]
    if (!p || p.action === 'skip') return true
    if (p.action === 'merge') return !!p.accountId
    return p.name?.trim() && /^[A-Z]{3}$/.test(p.currency ?? '')
  })

  function confirmAccounts() {
    // Drop rows whose account (or transfer destination) is skipped.
    const skippedNames = new Set(foundAccounts.filter((f) => plan[f.name]?.action === 'skip').map((f) => norm(f.name)))
    const kept = rows.filter((r) => {
      if (skippedNames.has(norm(r.account))) return false
      if (r.type === 'transfer' && skippedNames.has(norm(r.toAccount))) return false
      return true
    })
    if (!kept.length) { setError('Every account is set to “Don’t import”, so there’s nothing to import.'); return }
    setRows(kept)
    setReviewRows(kept.map((r) => ({ tempId: uuid(), ...r })))
    setError('')
    setStep('review')
  }

  // ---- Step 4: review ------------------------------------------------------
  const [reviewRows, setReviewRows] = useState([])
  const small = rows.length <= REVIEW_LIMIT
  const updateRow = (id, patch) => setReviewRows((rs) => rs.map((r) => (r.tempId === id ? { ...r, ...patch } : r)))
  const removeRow = (id) => setReviewRows((rs) => rs.filter((r) => r.tempId !== id))

  // ---- Account plan -> the array data.js importMigration expects -----------
  function buildPlanArray() {
    return foundAccounts.map((f) => {
      const p = plan[f.name] ?? {}
      if (p.action === 'merge') return { source: f.name, action: 'merge', accountId: p.accountId }
      if (p.action === 'skip') return { source: f.name, action: 'skip' }
      return { source: f.name, action: 'create', name: p.name ?? f.name, type: p.type ?? 'debit', currency: p.currency ?? baseCurrency }
    })
  }

  async function runImport() {
    setError(''); setStep('importing')
    const toImport = small
      ? reviewRows.map(({ tempId, ...r }) => r) // eslint-disable-line no-unused-vars
      : rows
    setProgress({ done: 0, total: toImport.length })
    try {
      const res = await importMigration(
        user.id, toImport, buildPlanArray(),
        { source, label: fileName },
        (done, total) => setProgress({ done, total }),
      )

      // Income/expense totals per currency (using each row's resolved account
      // currency) — a quick sanity figure for the user to compare.
      const byCur = new Map()
      for (const r of toImport) {
        if (r.type === 'transfer') continue
        const cur = currencyForAccount(r.account)
        if (!byCur.has(cur)) byCur.set(cur, { currency: cur, income: 0, expense: 0 })
        byCur.get(cur)[r.type] += Number(r.amount) || 0
      }
      setTotals([...byCur.values()])

      // Resulting balance of each touched account (server-computed), for the
      // user to check against their old app.
      const bal = await getAccountBalances()
      const balById = new Map((bal.data ?? []).map((b) => [b.account_id, Number(b.balance)]))
      setBalances((res.accounts ?? []).map((a) => ({ name: a.name, currency: a.currency, balance: balById.get(a.id) ?? 0 })))

      setResult(res)
      setStep('done')
    } catch (e) {
      setError(e?.message ?? 'Import failed.')
      setStep('review')
    }
  }

  async function handleUndo() {
    if (!result?.batchId) return
    setUndoing(true)
    const { error: err } = await undoImport(result.batchId)
    setUndoing(false)
    if (err) { setError(err.message); return }
    setUndone(true)
  }

  // ---- Back navigation -----------------------------------------------------
  function onBack() {
    if (step === 'map') { setStep('upload'); setAnalysis(null); return }
    if (step === 'accounts') { setStep(source === 'money-manager' ? 'upload' : 'map'); return }
    if (step === 'review') { setStep('accounts'); return }
    navigate('/settings/data')
  }

  const noAccountColumn = source === 'generic' && (mapping?.account ?? -1) < 0

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 pt-[calc(0.625rem_+_env(safe-area-inset-top))] pb-2.5 flex items-center gap-2">
          <button onClick={onBack} aria-label="Back" className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="font-bold text-[15px] flex-1">Switch from another app</div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4 desk:px-8 desk:py-6 w-full">
          <div className={`mx-auto ${step === 'review' && small ? 'desk:max-w-[1100px]' : 'max-w-[760px]'}`}>
            {error && (
              <div className="mb-4 rounded-xl border border-expense/40 bg-expense/10 px-3.5 py-3 text-[13.5px] text-expense">{error}</div>
            )}
            {loading ? <p className="text-muted text-sm py-8 text-center">Loading…</p>
              : step === 'upload' ? renderUpload()
              : step === 'map' ? renderMap()
              : step === 'accounts' ? renderAccounts()
              : step === 'review' ? renderReview()
              : step === 'importing' ? renderImporting()
              : renderDone()}
          </div>
        </main>

        {/* Sticky action bar for the account + review steps */}
        {(step === 'accounts' || (step === 'review')) && !loading && (
          <div className="shrink-0 bg-surface border-t border-border px-4 py-3 desk:px-8 flex items-center gap-2.5">
            <div className="flex-1 text-[13px] text-muted">
              {step === 'accounts'
                ? `${foundAccounts.length} account${foundAccounts.length === 1 ? '' : 's'} · ${summary.count} transactions`
                : `${(small ? reviewRows.length : rows.length)} transactions ready`}
            </div>
            {step === 'accounts'
              ? <Button onClick={confirmAccounts} disabled={!accountsValid}>Continue →</Button>
              : <Button onClick={runImport} disabled={small ? reviewRows.length === 0 : rows.length === 0}>
                  Import {small ? reviewRows.length : rows.length}
                </Button>}
          </div>
        )}
      </div>
    </div>
  )

  // ===== Step renderers ======================================================
  function renderUpload() {
    return (
      <div className="space-y-4">
        <p className="text-[13.5px] text-muted leading-relaxed">
          Moving from another expense tracker? Export your history there, then drop the file here — Smara reads your accounts, categories and transfers, you confirm, and it’s all in. Nothing is saved until you confirm, and a whole import can be undone in one tap.
        </p>
        <div className="rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-[12.5px] text-muted leading-relaxed">
          <div className="font-semibold text-text mb-1">Works best with</div>
          <strong>Money Manager</strong> (Realbyte) — exported as Excel — is recognised automatically. Money Lover, Wallet, Spendee, Mint and most others work too: you’ll just point Smara at the right columns.
        </div>
        <Button onClick={() => fileInput.current?.click()} disabled={reading} className="w-full">
          <UploadIcon className="w-[18px] h-[18px]" />
          {reading ? 'Reading…' : 'Choose export file (CSV or Excel)…'}
        </Button>
        <input ref={fileInput} type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
        <p className="text-[11.5px] text-faint leading-relaxed">
          Tip: in Money Manager, go to <strong>Settings → Backup / Export → Export to Excel</strong>, and pick the widest date range (or “All”) so your full history comes across.
        </p>
      </div>
    )
  }

  function renderMap() {
    const previewRows = built.rows
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] text-muted min-w-0 truncate"><span className="font-semibold text-text">{fileName}</span></div>
          <span className="text-[12px] text-faint shrink-0">{previewRows.length} ready · {built.skipped.length} skipped</span>
        </div>
        <p className="text-[13px] text-muted">Smara couldn’t auto-detect this app, so tell it which column is which. Leave a column as “— none —” if your file doesn’t have it.</p>

        <div className="bg-surface border border-border rounded-[14px] p-4 space-y-3.5">
          <div className="text-xs font-bold uppercase tracking-wide text-faint">Columns</div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Date"><ResponsiveSelect title="Date column" value={String(mapping.date)} onChange={(v) => setMap({ date: Number(v) })} options={colOptions} /></Field>
            <Field label="Date format"><ResponsiveSelect title="Date format" value={formats.dateFormat} onChange={(v) => setFmt({ dateFormat: v })} options={DATE_FORMAT_OPTIONS} /></Field>
          </div>

          <Field label="How are amounts shown?">
            <Segmented value={mapping.amountMode} onChange={(v) => setMap({ amountMode: v })}
              options={[{ value: 'single', label: 'One amount column' }, { value: 'debit_credit', label: 'Separate debit / credit' }]} />
          </Field>
          {mapping.amountMode === 'single' ? (
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Amount column"><ResponsiveSelect title="Amount" value={String(mapping.amount)} onChange={(v) => setMap({ amount: Number(v) })} options={colOptions} /></Field>
              <Field label="Amount style"><ResponsiveSelect title="Decimal separator" value={formats.decimal} onChange={(v) => setFmt({ decimal: v })} options={DECIMAL_OPTIONS} /></Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Debit (money out)"><ResponsiveSelect title="Debit column" value={String(mapping.debit)} onChange={(v) => setMap({ debit: Number(v) })} options={colOptionsNone} /></Field>
              <Field label="Credit (money in)"><ResponsiveSelect title="Credit column" value={String(mapping.credit)} onChange={(v) => setMap({ credit: Number(v) })} options={colOptionsNone} /></Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Type (income/expense/transfer)" hint="Optional — inferred from +/− if missing">
              <ResponsiveSelect title="Type column" value={String(mapping.type)} onChange={(v) => setMap({ type: Number(v) })} options={colOptionsNone} />
            </Field>
            <Field label="Currency" hint="Optional">
              <ResponsiveSelect title="Currency column" value={String(mapping.currency)} onChange={(v) => setMap({ currency: Number(v) })} options={colOptionsNone} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Account"><ResponsiveSelect title="Account column" value={String(mapping.account)} onChange={(v) => setMap({ account: Number(v) })} options={colOptionsNone} /></Field>
            <Field label="Transfer destination" hint="Optional"><ResponsiveSelect title="Destination column" value={String(mapping.toAccount)} onChange={(v) => setMap({ toAccount: Number(v) })} options={colOptionsNone} /></Field>
          </div>

          {noAccountColumn && (
            <Field label="No account column — import everything into" hint="Pick one account name for all rows">
              <TextInput value={fallbackAccount} onChange={(e) => setFallbackAccount(e.target.value)} placeholder="e.g. Cash" />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Category" hint="Optional"><ResponsiveSelect title="Category column" value={String(mapping.category)} onChange={(v) => setMap({ category: Number(v) })} options={colOptionsNone} /></Field>
            <Field label="Sub-category" hint="Optional"><ResponsiveSelect title="Sub-category column" value={String(mapping.subCategory)} onChange={(v) => setMap({ subCategory: Number(v) })} options={colOptionsNone} /></Field>
          </div>
          <Field label="Note / description" hint="Optional"><ResponsiveSelect title="Description column" value={String(mapping.description)} onChange={(v) => setMap({ description: Number(v) })} options={colOptionsNone} /></Field>
        </div>

        {/* Mini preview */}
        <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
          <div className="text-xs font-bold uppercase tracking-wide text-faint px-4 pt-3.5 pb-2">Preview</div>
          {previewRows.length === 0 ? (
            <p className="text-[13px] text-muted px-4 pb-4">No rows could be read — check the column choices above.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-faint text-left border-b border-border">
                <th className="font-semibold px-4 py-1.5">Date</th><th className="font-semibold px-2 py-1.5">Type</th>
                <th className="font-semibold px-2 py-1.5 text-right">Amount</th><th className="font-semibold px-4 py-1.5">Account</th>
              </tr></thead>
              <tbody>
                {previewRows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-1.5 tabular whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-1.5 capitalize">{r.type}</td>
                    <td className="px-2 py-1.5 text-right tabular whitespace-nowrap">{r.amount.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-muted truncate max-w-[1px]">{r.account}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Button onClick={confirmGeneric} disabled={!built.rows.length} className="w-full">Continue → match accounts</Button>
      </div>
    )
  }

  function renderAccounts() {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-muted leading-relaxed">
          We found <strong>{foundAccounts.length}</strong> account{foundAccounts.length === 1 ? '' : 's'} in <span className="font-semibold text-text">{fileName}</span>. For each, create a new Smara account or merge it into one you already have. Currency can’t change once an account exists, so check it now.
        </p>
        {foundAccounts.map((f) => {
          const p = plan[f.name] ?? {}
          return (
            <div key={f.name} className="bg-surface border border-border rounded-[14px] p-4">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="font-semibold text-[14px] text-text truncate">{f.name}</div>
                <span className="text-[11.5px] text-faint shrink-0">{f.count} row{f.count === 1 ? '' : 's'}</span>
              </div>
              <ResponsiveSelect
                title={`How to import “${f.name}”`}
                value={p.action === 'merge' ? p.accountId : CREATE}
                onChange={(v) => v === CREATE
                  ? setPlanFor(f.name, { action: 'create', name: f.name, type: p.type ?? 'debit', currency: p.currency ?? f.currency ?? baseCurrency, accountId: undefined })
                  : setPlanFor(f.name, { action: 'merge', accountId: v })}
                options={mergeOptions}
              />
              {p.action === 'create' && (
                <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                  <Field label="New account name" className="col-span-2">
                    <TextInput value={p.name ?? ''} onChange={(e) => setPlanFor(f.name, { name: e.target.value })} />
                  </Field>
                  <Field label="Type"><ResponsiveSelect title="Account type" value={p.type ?? 'debit'} onChange={(v) => setPlanFor(f.name, { type: v })} options={ACCOUNT_TYPE_OPTIONS} /></Field>
                  <Field label="Currency"><ResponsiveSelect title="Currency" value={p.currency ?? baseCurrency} onChange={(v) => setPlanFor(f.name, { currency: v })} options={currencyOptions()} /></Field>
                </div>
              )}
              <button type="button"
                onClick={() => setPlanFor(f.name, p.action === 'skip'
                  ? { action: existingByName.get(norm(f.name)) ? 'merge' : 'create', accountId: existingByName.get(norm(f.name))?.id, name: f.name, type: 'debit', currency: f.currency ?? baseCurrency }
                  : { action: 'skip' })}
                className={`mt-2.5 text-[12px] font-semibold ${p.action === 'skip' ? 'text-primary' : 'text-faint hover:text-expense'}`}>
                {p.action === 'skip' ? '↩ Don’t skip — import this account' : '✕ Don’t import this account'}
              </button>
            </div>
          )
        })}
        {skipped.length > 0 && (
          <p className="text-[12px] text-faint">{skipped.length} row{skipped.length === 1 ? '' : 's'} in the file couldn’t be read and will be left out.</p>
        )}
      </div>
    )
  }

  function renderReview() {
    if (small) return renderReviewCards()
    return renderSummary()
  }

  // Large import: aggregate overview, no per-row list (a list of thousands of
  // rows is noise — the post-import summary + balances are the real check).
  function renderSummary() {
    const usedAccounts = foundAccounts.filter((f) => plan[f.name]?.action !== 'skip').length
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-muted leading-relaxed">
          Ready to import. Everything is tagged, so right after this you’ll see the totals and resulting balances — and you can undo the whole thing in one tap if anything looks off.
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Expenses" value={summary.byType.expense} />
          <Stat label="Income" value={summary.byType.income} />
          <Stat label="Transfers" value={summary.byType.transfer} />
        </div>
        <div className="bg-surface border border-border rounded-[14px] p-4 text-[13px] text-muted space-y-1.5">
          <div><span className="text-text font-semibold">{summary.count.toLocaleString()}</span> transactions{summary.dateMin && <> from <span className="text-text font-semibold">{dayLabel(summary.dateMin)}</span> to <span className="text-text font-semibold">{dayLabel(summary.dateMax)}</span></>}.</div>
          <div>Into {usedAccounts} account{usedAccounts === 1 ? '' : 's'}. Missing categories are created automatically.</div>
        </div>
      </div>
    )
  }

  // Small import: editable rows.
  function renderReviewCards() {
    const accountSelectOptions = foundAccounts
      .filter((f) => plan[f.name]?.action !== 'skip')
      .map((f) => ({ value: f.name, label: f.name }))
    return (
      <div>
        <p className="text-[13px] text-muted mb-3">Check each row and fix anything that looks off. Categories are created automatically from their names.</p>
        {reviewRows.map((row, idx) => {
          const cur = currencyForAccount(row.account)
          return (
            <div key={row.tempId} className="bg-surface border border-border rounded-[14px] p-3 mt-2.5 first:mt-0">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Row {idx + 1}</span>
                <button type="button" onClick={() => removeRow(row.tempId)} className="text-xs text-faint hover:text-expense">✕ Remove</button>
              </div>
              <div className="grid grid-cols-2 gap-2.5 desk:flex desk:flex-wrap desk:items-end">
                <RField label="Type" deskW="desk:w-[120px] desk:flex-none">
                  <ResponsiveSelect title="Type" value={row.type} onChange={(v) => updateRow(row.tempId, { type: v, ...(v === 'transfer' ? { category: null, subCategory: null } : { toAccount: null }) })} options={TYPE_OPTIONS} />
                </RField>
                <RField label="Date" deskW="desk:w-[158px] desk:flex-none">
                  <DatePicker value={row.date} onChange={(v) => updateRow(row.tempId, { date: v })} className={inputClass} />
                </RField>
                <RField label="Amount" deskW="desk:w-[140px] desk:flex-none">
                  <NumberInput value={row.amount} onChange={(v) => updateRow(row.tempId, { amount: v })} locale={localeFor(cur)} currency={cur} decimals={currencyDecimals(cur)} placeholder="0" />
                </RField>
                <RField label="Account" deskW="desk:w-[160px] desk:flex-none">
                  <ResponsiveSelect title="Account" value={row.account} onChange={(v) => updateRow(row.tempId, { account: v })} options={accountSelectOptions} />
                </RField>
                {row.type === 'transfer' ? (
                  <RField label="To account" deskW="desk:w-[160px] desk:flex-none">
                    <ResponsiveSelect title="Destination account" placeholder="Choose…" value={row.toAccount ?? ''} onChange={(v) => updateRow(row.tempId, { toAccount: v })} options={accountSelectOptions.filter((o) => o.value !== row.account)} />
                  </RField>
                ) : (
                  <>
                    <RField label="Category"><TextInput value={row.category ?? ''} onChange={(e) => updateRow(row.tempId, { category: e.target.value })} placeholder="—" /></RField>
                    <RField label="Sub-category"><TextInput value={row.subCategory ?? ''} onChange={(e) => updateRow(row.tempId, { subCategory: e.target.value })} placeholder="—" /></RField>
                  </>
                )}
                <RField label="Note" full deskW="desk:basis-full">
                  <TextInput value={row.note ?? ''} onChange={(e) => updateRow(row.tempId, { note: e.target.value })} placeholder="Note" />
                </RField>
              </div>
            </div>
          )
        })}
        <div aria-hidden="true" className="h-[12dvh]" />
      </div>
    )
  }

  function renderImporting() {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-4">
        <p className="text-[15px] font-semibold text-text">Importing your history…</p>
        <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(pct, 5)}%` }} />
        </div>
        <p className="text-[13px] text-muted tabular">{progress.done.toLocaleString()} of {progress.total.toLocaleString()}</p>
        <p className="text-[12px] text-faint">Please keep this screen open until it finishes.</p>
      </div>
    )
  }

  function renderDone() {
    if (undone) {
      return (
        <div className="max-w-md mx-auto text-center py-12 space-y-4">
          <div className="text-[15px] font-semibold text-text">Import undone.</div>
          <p className="text-[13px] text-muted">Everything from this import has been removed. Created accounts stay (you can delete them in Settings → Accounts).</p>
          <Button onClick={() => navigate('/settings/data')} className="w-full">Back to data</Button>
        </div>
      )
    }
    const r = result ?? {}
    const clean = !r.skipped?.length
    return (
      <div className="max-w-md mx-auto py-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-income/15 text-income grid place-items-center text-2xl">✓</div>
          <div className="text-[18px] font-extrabold text-text">Welcome to Smara 🐢</div>
          <p className="text-[13.5px] text-muted">
            <span className="font-semibold text-text">{r.inserted?.toLocaleString()}</span> transactions imported
            {r.accountsCreated ? <>, {r.accountsCreated} new account{r.accountsCreated === 1 ? '' : 's'}</> : null}
            {r.categoriesCreated ? <>, {r.categoriesCreated} categor{r.categoriesCreated === 1 ? 'y' : 'ies'}</> : null}.
          </p>
          <div className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 py-1 ${clean ? 'bg-income/10 text-income' : 'bg-transfer/10 text-transfer'}`}>
            {clean ? '✓ Balances checked — nothing skipped' : `${r.skipped.length} row${r.skipped.length === 1 ? '' : 's'} couldn’t be read and were skipped`}
          </div>
        </div>

        {/* Totals imported — a quick figure to recognise. */}
        {totals.length > 0 && (
          <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-faint px-4 pt-3 pb-1">Totals imported</div>
            {totals.map((t) => (
              <div key={t.currency} className="px-4 py-2.5 border-t border-border first:border-t-0">
                {totals.length > 1 && <div className="text-[11px] font-semibold text-faint mb-1">{t.currency}</div>}
                <div className="flex justify-between text-[13.5px]">
                  <span className="text-muted">Income</span><span className="font-semibold text-income tabular">{formatMoney(t.income, t.currency)}</span>
                </div>
                <div className="flex justify-between text-[13.5px] mt-0.5">
                  <span className="text-muted">Expenses</span><span className="font-semibold text-expense tabular">{formatMoney(t.expense, t.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resulting account balances — compare against the old app. */}
        {balances.length > 0 && (
          <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-faint px-4 pt-3 pb-1">Account balances now</div>
            {balances.map((b) => (
              <div key={b.name} className="flex justify-between items-baseline px-4 py-2.5 border-t border-border first:border-t-0">
                <span className="text-[13.5px] text-muted truncate pr-3">{b.name}</span>
                <span className="text-[14px] font-extrabold text-text tabular shrink-0">{formatMoney(b.balance, b.currency)}</span>
              </div>
            ))}
            <p className="text-[11.5px] text-faint leading-relaxed px-4 py-2.5 border-t border-border">
              Check these match your old app. If anything’s off, undo and try again.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <Button onClick={() => navigate('/')} className="w-full">Looks good — see my transactions</Button>
          <Button variant="ghost" onClick={handleUndo} disabled={undoing} className="w-full">
            {undoing ? 'Undoing…' : 'Undo this import'}
          </Button>
        </div>
      </div>
    )
  }
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface border border-border rounded-[14px] p-3 text-center">
      <div className="text-[20px] font-extrabold text-text tabular">{value.toLocaleString()}</div>
      <div className="text-[11.5px] text-muted">{label}</div>
    </div>
  )
}

function RField({ label, full, deskW = 'desk:flex-1 desk:min-w-[150px]', className = '', children }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'col-span-2' : ''} ${deskW} ${className}`}>
      <label className="text-[10.5px] font-semibold text-muted pl-0.5">{label}</label>
      {children}
    </div>
  )
}
