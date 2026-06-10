import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { listAccounts, listGroups, listCategories, recentNotes, createTransactions, createCategory } from '../lib/data'
import { localeFor, currencyDecimals } from '../lib/currencies'
import { formatMoney } from '../lib/format'
import NumberInput from '../components/NumberInput'
import AutocompleteInput from '../components/AutocompleteInput'
import ResponsiveSelect from '../components/ResponsiveSelect'
import DatePicker from '../components/DatePicker'
import Sidebar from '../components/Sidebar'
import { Button, inputClass } from '../components/ui'
import { ChevronLeft } from '../lib/icons'

const DESK = 768 // --breakpoint-desk; below this we run the mobile keyboard-aware scrolling

function todayISO() {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

// A new row carries over the previous row's type, date and account(s) — the
// common case is several entries of the same kind on the same day.
function newRow(prev) {
  return {
    tempId: crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    kind: prev?.kind ?? 'expense',
    date: prev?.date ?? todayISO(),
    accountId: prev?.accountId ?? '',
    amount: null,
    categoryId: '',
    subId: '',
    note: '',
    toAccountId: prev?.toAccountId ?? '',
    toAmount: null,
  }
}

// Where to scroll (mobile) when a field is focused: bring this element to the
// top of the scroll area so the focused field clears the keyboard while keeping
// its own label/context in view. (Account → Category title; Note → Account
// title; the rest → the card top.)
function scrollTargetEl(card, field) {
  const q = (f) => card.querySelector(`[data-field="${f}"]`)
  if (field === 'account') return q('category') ?? card
  if (field === 'note') return q('account') ?? q('to') ?? card
  return card
}

export default function NewTransaction() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const KIND_OPTIONS = [
    { value: 'expense', label: t('tx.kind.expense') },
    { value: 'income', label: t('tx.kind.income') },
    { value: 'transfer', label: t('tx.kind.transfer') },
  ]

  const [accounts, setAccounts] = useState([])
  const [groups, setGroups] = useState([])
  const [categories, setCategories] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  const [rows, setRows] = useState([newRow()])
  const [rowErrors, setRowErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Note suggestions = saved-history notes PLUS notes already typed on other rows
  // in this same (unsaved) batch, so a note entered on row 1 is offered on row 2.
  const noteOptions = useMemo(() => {
    const set = new Set(notes)
    for (const r of rows) { const n = (r.note ?? '').trim(); if (n) set.add(n) }
    return [...set]
  }, [notes, rows])

  useEffect(() => {
    Promise.all([listAccounts(), listGroups(), listCategories(), recentNotes()]).then(
      ([a, g, c, n]) => {
        // Goal accounts are funded via "Add to goal", not manual entry — exclude them.
        const active = (a.data ?? []).filter((x) => !x.archived && !x.is_goal)
        setAccounts(active)
        setGroups(g.data ?? [])
        setCategories((c.data ?? []).filter((x) => !x.archived))
        setNotes(n ?? [])
        if (active.length === 1) setRows((r) => r.map((row) => ({ ...row, accountId: active[0].id })))
        setLoading(false)
      }
    )
  }, [])

  // Account options grouped by their account-group (Ungrouped last).
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

  const catOptionsFor = (kind) =>
    categories.filter((c) => c.kind === kind && !c.parent_id).map((c) => ({ value: c.id, label: c.name }))
  const subsFor = (catId) => categories.filter((c) => c.parent_id === catId)
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  // ---- Mobile category → sub-category (open the sub picker automatically) -----
  const subRefs = useRef({})
  const [openSubFor, setOpenSubFor] = useState(null)
  function onPickCat(id, val) {
    update(id, { categoryId: val, subId: '' })
    if (val && subsFor(val).length) setOpenSubFor(id)
  }

  // Inline category creation from the entry picker. Creates a top-level category
  // of the row's kind, adds it to local state, and returns its id so the picker
  // selects it immediately. Returns null on failure (the picker stays open).
  async function createCat(kind, name) {
    const sortOrder = categories.filter((c) => c.kind === kind && !c.parent_id).length
    const { data, error } = await createCategory(user.id, { kind, name, parent_id: null }, sortOrder)
    if (error || !data) {
      setSaveError(error?.message || t('tx.errCreateCat'))
      return null
    }
    setCategories((prev) => [...prev, data])
    return data.id
  }
  useEffect(() => {
    if (!openSubFor) return
    const t = setTimeout(() => {
      // Mobile only: pop the sub-category sheet. On desktop we leave focus alone
      // so Tab / Shift-Tab keep their natural order (auto-focusing the sub-
      // category was hijacking Shift-Tab back from Category).
      if (window.innerWidth < DESK) subRefs.current[openSubFor]?.open?.()
      setOpenSubFor(null)
    }, 0)
    return () => clearTimeout(t)
  }, [openSubFor])

  // ---- Scroll handling (mobile only) -----------------------------------------
  const rowRefs = useRef({})
  const scrollRef = useRef(null) // the internal scroll area (between header + save bar)
  const [focusId, setFocusId] = useState(null)
  const [enteringIds, setEnteringIds] = useState(() => new Set()) // rows currently playing the entrance animation

  // Scroll the internal area so `el` sits at the top (just below the header).
  // `smooth` animates the scroll (used when adding a row); field-focus lifts stay
  // instant so they keep pace with the opening keyboard.
  const liftToTop = useCallback((el, smooth = false) => {
    const sc = scrollRef.current
    if (!el || !sc) return
    // Leave a comfortable gap below the header so a lifted card (e.g. a freshly
    // added row) doesn't sit flush against it. ~20px matches the first row's rest gap.
    const y = sc.scrollTop + (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) - 20
    sc.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // On focus (mobile), bring the field's scroll target to the top. Deferred one
  // frame so it wins over the browser's minimal native scroll-into-view. Skipped
  // on desktop, where there's no keyboard and the row shouldn't jump.
  function handleCardFocus(e, tempId) {
    if (window.innerWidth >= DESK) return
    const fieldEl = e.target.closest('[data-field]')
    const card = rowRefs.current[tempId]
    if (!card) return
    const target = scrollTargetEl(card, fieldEl?.dataset.field)
    requestAnimationFrame(() => liftToTop(target))
  }

  // New row → smoothly bring the new card to the top so it eases up into view.
  useEffect(() => {
    if (!focusId) return
    const t = setTimeout(() => {
      const card = rowRefs.current[focusId]
      if (card) liftToTop(card, true)
      setFocusId(null)
    }, 60)
    return () => clearTimeout(t)
  }, [focusId, liftToTop])

  // The keyboard opens a beat after focus (the viewport resizes), so re-apply
  // the active field's target then too. Mobile only.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      if (window.innerWidth >= DESK) return
      const el = document.activeElement
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return
      const card = el.closest('[data-row-card]')
      const fieldEl = el.closest('[data-field]')
      if (card && fieldEl) liftToTop(scrollTargetEl(card, fieldEl.dataset.field))
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [liftToTop])

  // ---- Row mutations ---------------------------------------------------------
  function update(id, patch) {
    setRows((rs) => rs.map((r) => (r.tempId === id ? { ...r, ...patch } : r)))
  }
  function setRowKind(id, k) {
    update(id, { kind: k, categoryId: '', subId: '' }) // categories are kind-specific
  }
  function addRow() {
    const next = newRow(rows[rows.length - 1])
    setRows((rs) => [...rs, next])
    setFocusId(next.tempId)
    // Play the entrance animation, then drop the flag so re-renders don't replay it.
    setEnteringIds((s) => new Set(s).add(next.tempId))
    setTimeout(() => setEnteringIds((s) => {
      const n = new Set(s); n.delete(next.tempId); return n
    }), 360)
    // Desktop: drop focus into the new row's first field so keying onward keeps
    // entering (Enter on the add button no longer just re-triggers it).
    if (window.innerWidth >= DESK) {
      setTimeout(() => {
        rowRefs.current[next.tempId]?.querySelector('[data-field] input')?.focus()
      }, 0)
    }
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

  function isCross(r) {
    const f = accountById.get(r.accountId)?.currency
    const t = accountById.get(r.toAccountId)?.currency
    return f && t && f !== t
  }

  function validate() {
    const errs = {}
    for (const r of rows) {
      if (!r.date) { errs[r.tempId] = t('tx.errDate'); continue }
      if (r.kind === 'transfer') {
        if (!r.accountId || !r.toAccountId) errs[r.tempId] = t('tx.errBothAccounts')
        else if (r.accountId === r.toAccountId) errs[r.tempId] = t('tx.errSameAccount')
        else if (!r.amount || r.amount <= 0) errs[r.tempId] = t('tx.errAmount')
        else if (isCross(r) && (!r.toAmount || r.toAmount <= 0)) errs[r.tempId] = t('tx.errReceived')
      } else {
        if (!r.accountId) errs[r.tempId] = t('tx.errAccount')
        else if (!r.amount || r.amount <= 0) errs[r.tempId] = t('tx.errAmount')
      }
    }
    setRowErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function saveAll() {
    setSaveError('')
    if (!validate()) return
    setSaving(true)
    const payload = rows.map((r) => {
      if (r.kind === 'transfer') {
        const cross = isCross(r)
        return {
          kind: 'transfer',
          date: r.date,
          amount: r.amount,
          account_id: r.accountId,
          to_account_id: r.toAccountId,
          to_amount: cross ? r.toAmount : r.amount,
          exchange_rate: cross && r.toAmount ? r.amount / r.toAmount : null,
          category_id: null,
          note: r.note.trim() || null,
        }
      }
      return {
        kind: r.kind,
        date: r.date,
        amount: r.amount,
        account_id: r.accountId,
        category_id: r.subId || r.categoryId || null,
        note: r.note.trim() || null,
      }
    })
    const { error } = await createTransactions(user.id, payload)
    if (error) { setSaveError(t('tx.saveFailed')); setSaving(false); return }
    navigate('/')
  }

  const noAccounts = !loading && accounts.length === 0

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />

      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 pt-[calc(0.625rem_+_env(safe-area-inset-top))] pb-2.5 flex items-center gap-2">
          <button onClick={() => navigate(-1)} aria-label={t('common.back')}
            className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="font-bold text-[15px]">{t('tx.newTitle')}</div>
        </header>

        <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3.5 desk:px-8 desk:py-5 w-full">
          {loading ? (
            <p className="text-muted text-sm py-8 text-center">{t('common.loading')}</p>
          ) : noAccounts ? (
            <div className="bg-surface border border-border rounded-[14px] p-6 text-center max-w-md mx-auto mt-6">
              <p className="text-sm text-muted mb-4">{t('tx.needAccount')}</p>
              <Button onClick={() => navigate('/settings/accounts')}>{t('account.addAccount')}</Button>
            </div>
          ) : (
            <div className="desk:max-w-[1100px] desk:mx-auto">
              {rows.map((row, idx) => {
                const isTransfer = row.kind === 'transfer'
                const fromCur = accountById.get(row.accountId)?.currency ?? 'IDR'
                const toCur = accountById.get(row.toAccountId)?.currency
                const cross = isTransfer && toCur && fromCur !== toCur
                const currency = accountById.get(row.accountId)?.currency ?? 'IDR'
                const subs = !isTransfer && row.categoryId ? subsFor(row.categoryId) : []
                const err = rowErrors[row.tempId]
                return (
                  <div key={row.tempId}
                    ref={(el) => { rowRefs.current[row.tempId] = el }}
                    data-row-card
                    onFocusCapture={(e) => handleCardFocus(e, row.tempId)}
                    className={`bg-surface border rounded-[14px] p-3 mt-2.5 first:mt-1.5 desk:mt-2 ${err ? 'border-expense' : 'border-border'} ${enteringIds.has(row.tempId) ? 'animate-row-in' : ''}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-faint">{t('tx.row', { n: idx + 1 })}</span>
                      <button type="button" onClick={() => removeRow(row.tempId)} className="text-xs text-faint hover:text-expense">✕ {t('tx.remove')}</button>
                    </div>

                    {/* 2-up on mobile, a single labelled row on desktop */}
                    <div className="grid grid-cols-2 gap-2.5 desk:flex desk:flex-wrap desk:items-end desk:gap-2.5">
                      <MField label={t('tx.type')} field="type" deskW="desk:w-[118px] desk:flex-none">
                        <ResponsiveSelect title={t('tx.type')} placeholder={t('tx.type')} value={row.kind}
                          onChange={(v) => setRowKind(row.tempId, v)} options={KIND_OPTIONS} />
                      </MField>
                      <MField label={t('tx.date')} field="date" deskW="desk:w-[158px] desk:flex-none">
                        <DatePicker value={row.date} onChange={(v) => update(row.tempId, { date: v })} className={inputClass} />
                      </MField>
                      <MField label={cross ? t('tx.amountSent') : t('tx.amount')} field="amount" deskW="desk:w-[200px] desk:flex-none">
                        <NumberInput value={row.amount} onChange={(v) => update(row.tempId, { amount: v })}
                          locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
                      </MField>

                      {isTransfer ? (
                        <>
                          <MField label={t('tx.fromAccount')} field="from" full>
                            <ResponsiveSelect title={t('tx.fromAccount')} placeholder={t('tx.fromAccount')} value={row.accountId}
                              onChange={(v) => update(row.tempId, { accountId: v })} options={accountOptions} />
                          </MField>
                          <MField label={t('tx.toAccount')} field="to" full>
                            <ResponsiveSelect title={t('tx.toAccount')} placeholder={t('tx.toAccount')} value={row.toAccountId}
                              onChange={(v) => update(row.tempId, { toAccountId: v })} options={accountOptions} />
                          </MField>
                          {cross && (
                            <MField label={t('tx.received', { cur: toCur })} field="received" full>
                              <NumberInput value={row.toAmount} onChange={(v) => update(row.tempId, { toAmount: v })}
                                locale={localeFor(toCur)} currency={toCur} decimals={currencyDecimals(toCur)} placeholder="0" />
                            </MField>
                          )}
                        </>
                      ) : (
                        <>
                          <MField label={t('tx.category')} field="category" full={subs.length === 0} deskW="desk:flex-1 desk:max-w-[162px] desk:min-w-[140px]">
                            <ResponsiveSelect title={t('tx.category')} placeholder={t('tx.categoryPlaceholder')} value={row.categoryId}
                              onChange={(v) => onPickCat(row.tempId, v)} options={catOptionsFor(row.kind)}
                              onCreate={(name) => createCat(row.kind, name)} />
                          </MField>
                          {/* Sub-category is a stable column on desktop (kept even when the
                              chosen category has none, so rows don't reflow); on mobile it
                              only appears when there's something to pick. */}
                          <MField label={t('tx.subcategory')} field="subcategory" deskW="desk:flex-1 desk:max-w-[162px] desk:min-w-[140px]" className={subs.length === 0 ? 'max-desk:hidden' : ''}>
                            {subs.length > 0 ? (
                              <ResponsiveSelect ref={(el) => { subRefs.current[row.tempId] = el }}
                                title={t('tx.subcategory')} placeholder={t('common.none')} noneLabel={t('common.none')}
                                value={row.subId} onChange={(v) => update(row.tempId, { subId: v })}
                                options={subs.map((s) => ({ value: s.id, label: s.name }))} />
                            ) : (
                              <div className={`${inputClass} flex items-center text-faint`} aria-hidden="true">—</div>
                            )}
                          </MField>
                          {/* Desktop: break so Account + Note sit on their own line,
                              leaving the first line (type/date/amount/category/sub)
                              roomier. */}
                          <div aria-hidden="true" className="hidden desk:block desk:basis-full" />
                          <MField label={t('tx.account')} field="account" full>
                            <ResponsiveSelect title={t('tx.account')} placeholder={t('tx.choose')} value={row.accountId}
                              onChange={(v) => update(row.tempId, { accountId: v })} options={accountOptions} />
                          </MField>
                        </>
                      )}

                      <MField label={t('tx.note')} field="note" full deskW="desk:flex-1 desk:min-w-[160px]">
                        <AutocompleteInput value={row.note} onChange={(v) => update(row.tempId, { note: v })}
                          suggestions={noteOptions} placeholder={t('tx.notePlaceholder')} className={inputClass} />
                      </MField>
                    </div>

                    {cross && row.amount > 0 && row.toAmount > 0 && (
                      <div className="text-[11px] text-faint mt-2 px-0.5">
                        {t('tx.rate', { cur: toCur, amount: formatMoney(row.amount / row.toAmount, fromCur) })}
                      </div>
                    )}
                    {err && <p role="alert" className="text-sm text-expense mt-1.5 px-1">{err}</p>}
                  </div>
                )
              })}

              <button onClick={addRow}
                className="w-full mt-2.5 desk:mt-3 py-3 border-[1.5px] border-dashed border-border rounded-[14px] text-muted font-semibold text-sm hover:border-primary hover:text-primary">
                ＋ {t('tx.addRow')}
              </button>

              {saveError && (
                <div role="alert" className="bg-expense/10 border border-expense/40 rounded-xl p-3 mt-4">
                  <p className="text-sm text-expense">{saveError}</p>
                </div>
              )}

              {/* Lets the last row scroll all the way to the top. */}
              <div aria-hidden="true" className="h-[45dvh]" />
            </div>
          )}
        </main>

        {/* Save bar (below the scroll area — never overlaps fields). Hidden on
            native while the keyboard is open so it doesn't float above it. */}
        {!loading && !noAccounts && (
          <div data-hide-on-keyboard className="shrink-0 bg-surface border-t border-border px-4 py-3 desk:px-8 flex items-center gap-3">
            <div className="flex-1 text-[13px] text-muted">
              {t('tx.totalRows', { count: rows.length })}
              <div className="text-[17px] font-extrabold text-text tabular">
                {totals.length === 0 ? '—' : totals.map(([c, v]) => formatMoney(v, c)).join(' · ')}
              </div>
            </div>
            <Button variant="ghost" onClick={() => { setRows([newRow()]); setRowErrors({}); setSaveError('') }} disabled={saving}>
              {t('tx.reset')}
            </Button>
            <Button onClick={saveAll} disabled={saving}>{saving ? t('tx.saving') : t('tx.saveAll', { count: rows.length })}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Card field: label + control. `field` tags it for the mobile scroll-target
// logic; `full` spans both grid columns on mobile; `deskW` sets its width in the
// horizontal desktop row.
function MField({ label, field, full, deskW = 'desk:flex-1 desk:min-w-[140px]', className = '', children }) {
  return (
    <div data-field={field} className={`flex flex-col gap-1.5 ${full ? 'col-span-2' : ''} ${deskW} ${className}`}>
      <label className="text-[10.5px] font-semibold text-muted pl-0.5">{label}</label>
      {children}
    </div>
  )
}
