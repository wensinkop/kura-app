import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { listAccounts, listGroups, listCategories, recentNotes, createTransactions } from '../lib/data'
import { localeFor, currencyDecimals } from '../lib/currencies'
import { formatMoney } from '../lib/format'
import NumberInput from '../components/NumberInput'
import AutocompleteInput from '../components/AutocompleteInput'
import SearchableSelect from '../components/SearchableSelect'
import DatePicker from '../components/DatePicker'
import Sidebar from '../components/Sidebar'
import { Button, inputClass } from '../components/ui'
import { ChevronLeft, CloseIcon } from '../lib/icons'

const KINDS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' }, // disabled — Chunk 3
]

// Shared desktop column template (Date | Amount | Category | Sub | Account | Note | ✕).
const REG_COLS =
  'desk:grid desk:grid-cols-[110px_140px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_28px] desk:gap-2.5 desk:items-start'

function todayISO() {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function newRow(prev) {
  return {
    tempId: crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    date: prev?.date ?? todayISO(),
    accountId: prev?.accountId ?? '',
    amount: null,
    categoryId: '',
    subId: '',
    note: '',
  }
}

export default function NewTransaction() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [accounts, setAccounts] = useState([])
  const [groups, setGroups] = useState([])
  const [categories, setCategories] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  const [kind, setKind] = useState('expense')
  const [rows, setRows] = useState([newRow()])
  const [rowErrors, setRowErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    Promise.all([listAccounts(), listGroups(), listCategories(), recentNotes()]).then(
      ([a, g, c, n]) => {
        const active = (a.data ?? []).filter((x) => !x.archived)
        setAccounts(active)
        setGroups(g.data ?? [])
        setCategories((c.data ?? []).filter((x) => !x.archived))
        setNotes(n ?? [])
        // Pre-select the only account, if there's exactly one.
        if (active.length === 1) setRows((r) => r.map((row) => ({ ...row, accountId: active[0].id })))
        setLoading(false)
      }
    )
  }, [])

  // Account options grouped by their account-group (Ungrouped last), ordered by
  // group sort then account sort.
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
      .map((a) => ({
        value: a.id,
        label: `${a.name} · ${a.currency}`,
        group: a.group_id ? gName.get(a.group_id) ?? 'Group' : 'Ungrouped',
      }))
  }, [accounts, groups])

  // Top-level categories of the current kind.
  const topCats = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.parent_id),
    [categories, kind]
  )
  const catOptions = useMemo(() => topCats.map((c) => ({ value: c.id, label: c.name })), [topCats])
  const subsFor = (catId) =>
    categories.filter((c) => c.parent_id === catId).map((c) => ({ value: c.id, label: c.name }))

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  // Autofocus the newly added row's date input.
  const dateRefs = useRef({})
  const [focusId, setFocusId] = useState(null)
  useEffect(() => {
    if (!focusId) return
    const t = setTimeout(() => {
      const el = dateRefs.current[focusId]
      if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus() } catch { /* ignore */ } }
      setFocusId(null)
    }, 0)
    return () => clearTimeout(t)
  }, [focusId])

  function switchKind(k) {
    if (k === 'transfer') return // disabled this chunk
    setKind(k)
    // Categories are kind-specific — clear category/sub selections.
    setRows((rs) => rs.map((r) => ({ ...r, categoryId: '', subId: '' })))
  }

  function update(id, patch) {
    setRows((rs) => rs.map((r) => (r.tempId === id ? { ...r, ...patch } : r)))
  }
  function addRow() {
    const next = newRow(rows[rows.length - 1])
    setRows((rs) => [...rs, next])
    setFocusId(next.tempId)
  }
  function removeRow(id) {
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.tempId !== id)))
  }

  // Per-currency totals across rows with a positive amount.
  const totals = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const amt = Number(r.amount) || 0
      const cur = accountById.get(r.accountId)?.currency
      if (amt > 0 && cur) m.set(cur, (m.get(cur) ?? 0) + amt)
    }
    return [...m.entries()]
  }, [rows, accountById])

  function validate() {
    const errs = {}
    for (const r of rows) {
      if (!r.date) errs[r.tempId] = 'Pick a date.'
      else if (!r.accountId) errs[r.tempId] = 'Choose an account.'
      else if (!r.amount || r.amount <= 0) errs[r.tempId] = 'Enter an amount greater than zero.'
    }
    setRowErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function saveAll() {
    setSaveError('')
    if (!validate()) return
    setSaving(true)
    const payload = rows.map((r) => ({
      kind,
      date: r.date,
      amount: r.amount,
      account_id: r.accountId,
      category_id: r.subId || r.categoryId || null,
      note: r.note.trim() || null,
    }))
    const { error } = await createTransactions(user.id, payload)
    if (error) { setSaveError(error.message); setSaving(false); return }
    navigate('/') // back to Home to see the result
  }

  const noAccounts = !loading && accounts.length === 0

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-surface border-b border-border px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Back"
            className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="font-bold text-[17px]">New transactions</div>
        </header>

        <main className="flex-1 px-4 py-4 desk:px-8 w-full desk:max-w-[1100px] desk:mx-auto">
          {loading ? (
            <p className="text-muted text-sm py-8 text-center">Loading…</p>
          ) : noAccounts ? (
            <div className="bg-surface border border-border rounded-[14px] p-6 text-center max-w-md mx-auto mt-6">
              <p className="text-sm text-muted mb-4">You need an account before adding transactions.</p>
              <Button onClick={() => navigate('/settings/accounts')}>Add an account</Button>
            </div>
          ) : (
            <>
              {/* Type toggle */}
              <div className="flex bg-surface-2 border border-border rounded-xl p-1 gap-1 max-w-[420px]">
                {KINDS.map((k) => {
                  const on = kind === k.value
                  const disabled = k.value === 'transfer'
                  return (
                    <button key={k.value} onClick={() => switchKind(k.value)} disabled={disabled}
                      title={disabled ? 'Transfers arrive in Chunk 3' : undefined}
                      className={`flex-1 py-2 rounded-[9px] font-bold text-[14px] transition-colors ${
                        on
                          ? k.value === 'income' ? 'bg-surface text-income shadow-sm' : 'bg-surface text-expense shadow-sm'
                          : disabled ? 'text-faint/50 cursor-not-allowed' : 'text-muted'
                      }`}>
                      {k.label}{disabled && ' · soon'}
                    </button>
                  )
                })}
              </div>

              {/* Desktop column labels */}
              <div className={`hidden ${REG_COLS} px-1 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-faint`}>
                <span>Date</span><span>Amount</span><span>Category</span><span>Sub-category</span><span>Account</span><span>Note</span><span />
              </div>

              {/* Rows */}
              <div className="flex flex-col">
                {rows.map((row, idx) => {
                  const acct = accountById.get(row.accountId)
                  const currency = acct?.currency ?? 'IDR'
                  const subs = row.categoryId ? subsFor(row.categoryId) : []
                  const err = rowErrors[row.tempId]
                  return (
                    <div key={row.tempId}
                      className={`bg-surface border rounded-[14px] p-3.5 mt-3.5 desk:bg-transparent desk:border-0 desk:rounded-none desk:p-1 desk:mt-1.5 ${REG_COLS} ${
                        err ? 'border-expense desk:border-0' : 'border-border'
                      }`}>
                      {/* Mobile row header */}
                      <div className="flex justify-between items-center mb-2.5 desk:hidden">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Row {idx + 1}</span>
                        <button onClick={() => removeRow(row.tempId)} className="text-xs text-faint hover:text-expense">✕ Remove</button>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 desk:contents">
                        <Cell label="Date">
                          <DatePicker ref={(el) => { dateRefs.current[row.tempId] = el }}
                            value={row.date} onChange={(v) => update(row.tempId, { date: v })} className={inputClass} />
                        </Cell>
                        <Cell label="Amount">
                          <NumberInput value={row.amount} onChange={(v) => update(row.tempId, { amount: v })}
                            locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
                        </Cell>
                        <Cell label="Category">
                          <SearchableSelect value={row.categoryId}
                            onChange={(v) => update(row.tempId, { categoryId: v, subId: '' })}
                            options={catOptions} className={inputClass} placeholder="—" />
                        </Cell>
                        <Cell label="Sub-category">
                          <SearchableSelect value={row.subId}
                            onChange={(v) => update(row.tempId, { subId: v })}
                            options={subs} className={inputClass}
                            placeholder={subs.length ? '—' : 'none'} />
                        </Cell>
                        <Cell label="Account">
                          <SearchableSelect value={row.accountId}
                            onChange={(v) => update(row.tempId, { accountId: v })}
                            options={accountOptions} className={inputClass} placeholder="Choose…" />
                        </Cell>
                        <Cell label="Note" full>
                          <AutocompleteInput value={row.note} onChange={(v) => update(row.tempId, { note: v })}
                            suggestions={notes} placeholder="e.g. Monthly groceries" className={inputClass} />
                        </Cell>
                        <button onClick={() => removeRow(row.tempId)} title="Remove row"
                          className="hidden desk:grid place-items-center text-faint hover:text-expense self-center">
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      </div>

                      {err && <p className="text-sm text-expense mt-2 desk:col-span-7">{err}</p>}
                    </div>
                  )
                })}
              </div>

              <button onClick={addRow}
                className="w-full mt-3.5 py-3 border-[1.5px] border-dashed border-border rounded-[14px] text-muted font-semibold text-sm hover:border-primary hover:text-primary">
                ＋ Add another row
              </button>

              {saveError && (
                <div className="bg-expense/10 border border-expense/40 rounded-xl p-3 mt-4">
                  <p className="text-sm text-expense">{saveError}</p>
                </div>
              )}
            </>
          )}
        </main>

        {/* Sticky save bar */}
        {!loading && !noAccounts && (
          <div className="sticky bottom-0 bg-surface border-t border-border px-4 py-3 desk:px-8 flex items-center gap-3">
            <div className="flex-1 text-[13px] text-muted">
              Total · {rows.length} row{rows.length === 1 ? '' : 's'}
              <div className="text-[17px] font-extrabold text-text tabular">
                {totals.length === 0 ? '—' : totals.map(([c, v]) => formatMoney(v, c)).join(' · ')}
              </div>
            </div>
            <Button variant="ghost" onClick={() => { setRows([newRow()]); setRowErrors({}); setSaveError('') }} disabled={saving}>
              Reset
            </Button>
            <Button onClick={saveAll} disabled={saving}>{saving ? 'Saving…' : `Save all (${rows.length})`}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Field cell: label shows on mobile, hidden on desktop (column header covers it).
function Cell({ label, full, children }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'col-span-2 desk:col-span-1' : ''}`}>
      <label className="text-[11px] font-semibold text-muted pl-0.5 desk:hidden">{label}</label>
      {children}
    </div>
  )
}
