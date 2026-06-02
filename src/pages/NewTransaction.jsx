import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { listAccounts, listGroups, listCategories, recentNotes, createTransactions } from '../lib/data'
import { localeFor, currencyDecimals } from '../lib/currencies'
import { formatMoney } from '../lib/format'
import NumberInput from '../components/NumberInput'
import AutocompleteInput from '../components/AutocompleteInput'
import SearchableSelect from '../components/SearchableSelect'
import MobileSelect from '../components/MobileSelect'
import DatePicker from '../components/DatePicker'
import Sidebar from '../components/Sidebar'
import { Button, inputClass } from '../components/ui'
import { ChevronLeft, CloseIcon } from '../lib/icons'

const KINDS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' }, // disabled — Chunk 3
]

// Desktop register column template (Date | Amount | Category | Sub | Account | Note | ✕).
const REG_COLS =
  'desk:grid-cols-[110px_140px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_28px]'

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

  // Top-level categories of the current kind, and the sub-categories of each.
  const topCats = useMemo(() => categories.filter((c) => c.kind === kind && !c.parent_id), [categories, kind])
  const catOptions = useMemo(() => topCats.map((c) => ({ value: c.id, label: c.name })), [topCats])
  const subsFor = (catId) => categories.filter((c) => c.parent_id === catId)

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  // ---- Mobile category → sub-category (two short native pickers) -------------
  // Pick the category first (short top-level list); if it has sub-categories the
  // sub picker opens automatically so you flow straight into it without having
  // to tap a second placeholder.
  const subRefs = useRef({})
  const [openSubFor, setOpenSubFor] = useState(null)
  function onMobileCat(id, val) {
    update(id, { categoryId: val, subId: '' })
    if (val && subsFor(val).length) setOpenSubFor(id)
  }
  useEffect(() => {
    if (!openSubFor) return
    const t = setTimeout(() => {
      subRefs.current[openSubFor]?.open?.()
      setOpenSubFor(null)
    }, 0)
    return () => clearTimeout(t)
  }, [openSubFor])

  // ---- New-row focus + keep the active card above the keyboard ---------------
  const HEADER_OFFSET = 64 // sticky header height; leave the card just below it
  const rowRefs = useRef({})
  const [focusId, setFocusId] = useState(null)

  // Scroll the window so a card sits just below the sticky header. Computed
  // target + window.scrollTo is reliable (scrollIntoView was slow/flaky here);
  // the bottom spacer guarantees even the last row can reach the top.
  function scrollCardToTop(card) {
    if (!card) return
    const y = window.scrollY + card.getBoundingClientRect().top - HEADER_OFFSET
    window.scrollTo(0, Math.max(0, y)) // instant: reliable across browsers + snappy
  }

  useEffect(() => {
    if (!focusId) return
    const t = setTimeout(() => {
      const card = rowRefs.current[focusId]
      if (card) {
        const first = [...card.querySelectorAll('input,select')].find((el) => el.offsetParent !== null)
        try { first?.focus({ preventScroll: true }) } catch { /* ignore */ }
        scrollCardToTop(card)
      }
      setFocusId(null)
    }, 60)
    return () => clearTimeout(t)
  }, [focusId])

  // Whenever a field in a row gains focus, lift that card to the top so the
  // on-screen keyboard never covers it.
  function liftRow(tempId) {
    scrollCardToTop(rowRefs.current[tempId])
  }

  function switchKind(k) {
    if (k === 'transfer') return
    setKind(k)
    setRows((rs) => rs.map((r) => ({ ...r, categoryId: '', subId: '' }))) // categories are kind-specific
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
    navigate('/')
  }

  const noAccounts = !loading && accounts.length === 0

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-surface border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Back"
            className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="font-bold text-[17px]">New transactions</div>
        </header>

        <main className="flex-1 px-4 py-3.5 desk:px-8 desk:py-4 w-full desk:max-w-[1100px] desk:mx-auto">
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
              <div className={`hidden desk:grid ${REG_COLS} gap-2.5 px-1 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-faint`}>
                <span>Date</span><span>Amount</span><span>Category</span><span>Sub-category</span><span>Account</span><span>Note</span><span />
              </div>

              {/* Rows */}
              <div className="flex flex-col">
                {rows.map((row, idx) => {
                  const currency = accountById.get(row.accountId)?.currency ?? 'IDR'
                  const subs = row.categoryId ? subsFor(row.categoryId) : []
                  const err = rowErrors[row.tempId]
                  return (
                    <div key={row.tempId}
                      ref={(el) => { rowRefs.current[row.tempId] = el }}
                      onFocusCapture={() => liftRow(row.tempId)}
                      className="scroll-mt-[68px] mt-2.5 desk:mt-1.5">

                      {/* ===== MOBILE: compact card with native pickers ===== */}
                      <div className={`desk:hidden bg-surface border rounded-[14px] p-3 ${err ? 'border-expense' : 'border-border'}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Row {idx + 1}</span>
                          <button onClick={() => removeRow(row.tempId)} className="text-xs text-faint hover:text-expense">✕ Remove</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <MField label="Date">
                            <DatePicker value={row.date} onChange={(v) => update(row.tempId, { date: v })} className={inputClass} />
                          </MField>
                          <MField label="Amount">
                            <NumberInput value={row.amount} onChange={(v) => update(row.tempId, { amount: v })}
                              locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
                          </MField>
                          <MField label="Category" full={subs.length === 0}>
                            <MobileSelect title="Category" placeholder="— Category —"
                              value={row.categoryId} onChange={(v) => onMobileCat(row.tempId, v)} options={catOptions} />
                          </MField>
                          {subs.length > 0 && (
                            <MField label="Sub-category">
                              <MobileSelect ref={(el) => { subRefs.current[row.tempId] = el }}
                                title="Sub-category" placeholder="— none —" noneLabel="— none —"
                                value={row.subId} onChange={(v) => update(row.tempId, { subId: v })}
                                options={subs.map((s) => ({ value: s.id, label: s.name }))} />
                            </MField>
                          )}
                          <MField label="Account" full>
                            <MobileSelect title="Account" placeholder="Choose account…"
                              value={row.accountId} onChange={(v) => update(row.tempId, { accountId: v })} options={accountOptions} />
                          </MField>
                          <MField label="Note" full>
                            <AutocompleteInput value={row.note} onChange={(v) => update(row.tempId, { note: v })}
                              suggestions={notes} placeholder="e.g. Monthly groceries" className={inputClass} />
                          </MField>
                        </div>
                      </div>

                      {/* ===== DESKTOP: register row with searchable selects ===== */}
                      <div className={`hidden desk:grid ${REG_COLS} gap-2.5 items-start p-1 ${err ? 'ring-1 ring-expense rounded-lg' : ''}`}>
                        <DatePicker value={row.date} onChange={(v) => update(row.tempId, { date: v })} className={inputClass} />
                        <NumberInput value={row.amount} onChange={(v) => update(row.tempId, { amount: v })}
                          locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
                        <SearchableSelect value={row.categoryId}
                          onChange={(v) => update(row.tempId, { categoryId: v, subId: '' })}
                          options={catOptions} className={inputClass} placeholder="—" />
                        <SearchableSelect value={row.subId}
                          onChange={(v) => update(row.tempId, { subId: v })}
                          options={subs.map((s) => ({ value: s.id, label: s.name }))} className={inputClass}
                          placeholder={subs.length ? '—' : 'none'} />
                        <SearchableSelect value={row.accountId}
                          onChange={(v) => update(row.tempId, { accountId: v })}
                          options={accountOptions} className={inputClass} placeholder="Choose…" />
                        <AutocompleteInput value={row.note} onChange={(v) => update(row.tempId, { note: v })}
                          suggestions={notes} placeholder="e.g. Monthly groceries" className={inputClass} />
                        <button onClick={() => removeRow(row.tempId)} title="Remove row"
                          className="grid place-items-center text-faint hover:text-expense self-center">
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      </div>

                      {err && <p className="text-sm text-expense mt-1.5 px-1">{err}</p>}
                    </div>
                  )
                })}
              </div>

              <button onClick={addRow}
                className="w-full mt-3 py-3 border-[1.5px] border-dashed border-border rounded-[14px] text-muted font-semibold text-sm hover:border-primary hover:text-primary">
                ＋ Add another row
              </button>

              {saveError && (
                <div className="bg-expense/10 border border-expense/40 rounded-xl p-3 mt-4">
                  <p className="text-sm text-expense">{saveError}</p>
                </div>
              )}

              {/* Lets the last row scroll all the way to the top (above the keyboard). */}
              <div aria-hidden="true" className="h-[60vh] desk:hidden" />
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

// Mobile field: label + control (label hidden on desktop branch since it never renders there).
function MField({ label, full, children }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'col-span-2' : ''}`}>
      <label className="text-[10.5px] font-semibold text-muted pl-0.5">{label}</label>
      {children}
    </div>
  )
}

