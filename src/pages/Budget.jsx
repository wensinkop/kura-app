import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../AuthContext'
import {
  listBudgets, listCategories, listAccounts, listTransactionsInRange, listBudgetAmounts,
  createBudget, updateBudget, deleteBudget, upsertBudgetAmount,
} from '../lib/data'
import {
  periodRange, shiftAnchor, endExclusive, spendFor, rollupByParentCurrency,
  budgetStatus, windowState, carryover, amountForMonth,
} from '../lib/budgets'
import { formatMoney, formatDate } from '../lib/format'
import { localeFor } from '../lib/currencies'
import { Button, Field, TextInput, Segmented, Modal, ConfirmDialog } from '../components/ui'
import SwipePager from '../components/SwipePager'
import ResponsiveSelect from '../components/ResponsiveSelect'
import NumberInput from '../components/NumberInput'
import DatePicker from '../components/DatePicker'
import { PlusIcon, PencilIcon, ChevronLeft, ChevronRight, ChevronDown } from '../lib/icons'

const RECURRING = ['week', 'month', 'year']
const pad = (n) => String(n).padStart(2, '0')
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
// First day of the month after the given 'YYYY-MM-01'.
function nextMonthISO(monthStartISO) {
  const [y, m] = monthStartISO.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
}

export default function Budget() {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const dateFmt = profile?.date_format ?? 'dmy'

  const [period, setPeriod] = useState('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [menuOpen, setMenuOpen] = useState(false)

  const [budgets, setBudgets] = useState([])
  const [amounts, setAmounts] = useState([]) // budget_amounts rows (per-month schedule)
  const [cats, setCats] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const [rangeTxns, setRangeTxns] = useState([])
  const [customTxns, setCustomTxns] = useState([])
  const [histTxns, setHistTxns] = useState([])

  const [sheet, setSheet] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [showUnbudgeted, setShowUnbudgeted] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const expenseTops = useMemo(
    () => cats.filter((c) => c.kind === 'expense' && !c.parent_id && !c.archived),
    [cats]
  )
  const subsByParent = useMemo(() => {
    const m = new Map()
    for (const c of cats) {
      if (c.kind === 'expense' && c.parent_id && !c.archived) {
        if (!m.has(c.parent_id)) m.set(c.parent_id, [])
        m.get(c.parent_id).push(c)
      }
    }
    return m
  }, [cats])
  const currencyList = useMemo(() => {
    const set = new Set(accounts.map((a) => a.currency))
    set.add(base)
    return [...set]
  }, [accounts, base])

  // Category options for the sheet: each parent followed by its sub-categories.
  const catOptions = useMemo(() => {
    const out = []
    for (const p of [...expenseTops].sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ value: p.id, label: p.name })
      for (const s of (subsByParent.get(p.id) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
        out.push({ value: s.id, label: `↳ ${s.name}` })
      }
    }
    return out
  }, [expenseTops, subsByParent])

  const entriesByBudget = useMemo(() => {
    const m = new Map()
    for (const e of amounts) {
      if (!m.has(e.budget_id)) m.set(e.budget_id, [])
      m.get(e.budget_id).push(e)
    }
    return m
  }, [amounts])

  function reloadAll() {
    return Promise.all([listBudgets(), listCategories(), listAccounts(), listBudgetAmounts()]).then(([b, c, a, am]) => {
      if (!b.error) setBudgets(b.data ?? [])
      if (!c.error) setCats(c.data ?? [])
      if (!a.error) setAccounts(a.data ?? [])
      if (!am.error) setAmounts(am.data ?? [])
      setLoading(false)
    })
  }
  useEffect(() => { reloadAll() }, [])

  const range = periodRange(period, anchor)
  useEffect(() => {
    let alive = true
    listTransactionsInRange(range.start, range.end).then(({ data, error }) => {
      if (alive && !error) setRangeTxns(data ?? [])
    })
    return () => { alive = false }
  }, [period, range.start, range.end])

  const customBudgets = useMemo(() => budgets.filter((b) => b.period === 'custom'), [budgets])
  const customKey = customBudgets.map((b) => `${b.start_date}:${b.end_date}`).sort().join(',')
  useEffect(() => {
    const tid = setTimeout(() => {
      if (!customBudgets.length) { setCustomTxns([]); return }
      let minStart = customBudgets[0].start_date
      let maxEnd = customBudgets[0].end_date
      for (const b of customBudgets) {
        if (b.start_date < minStart) minStart = b.start_date
        if (b.end_date > maxEnd) maxEnd = b.end_date
      }
      listTransactionsInRange(minStart, endExclusive(maxEnd)).then(({ data, error }) => {
        if (!error) setCustomTxns(data ?? [])
      })
    }, 0)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKey])

  const recurring = useMemo(() => budgets.filter((b) => b.period === period), [budgets, period])
  const rollup = useMemo(() => rollupByParentCurrency(rangeTxns), [rangeTxns])

  // Historical txns for rollover budgets in view (one fetch).
  const rollBudgets = useMemo(() => recurring.filter((b) => b.rollover && b.rollover !== 'none'), [recurring])
  const rollKey = rollBudgets.map((b) => `${b.id}:${b.rollover}:${b.created_at}`).join(',') + '|' + range.start
  useEffect(() => {
    const tid = setTimeout(() => {
      if (!rollBudgets.length) { setHistTxns([]); return }
      let minStart = range.start
      for (const b of rollBudgets) {
        const s = periodRange(b.period, new Date(b.created_at)).start
        if (s < minStart) minStart = s
      }
      if (minStart >= range.start) { setHistTxns([]); return }
      listTransactionsInRange(minStart, range.start).then(({ data, error }) => {
        if (!error) setHistTxns(data ?? [])
      })
    }, 0)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey])

  // Effective amount per recurring budget in view = (per-month or base amount)
  // + rollover carried in. base = the amount that applies to the viewed period.
  const effectiveMap = useMemo(() => {
    const m = new Map()
    for (const b of recurring) {
      const baseAmt = b.period === 'month' ? amountForMonth(b, entriesByBudget.get(b.id), range.start) : Number(b.amount)
      const rolled = b.rollover && b.rollover !== 'none'
        ? carryover(b, catMap.get(b.category_id), histTxns, range.start, entriesByBudget.get(b.id) ?? [])
        : 0
      m.set(b.id, { base: baseAmt, amount: baseAmt + rolled, rolled })
    }
    return m
  }, [recurring, entriesByBudget, range.start, histTxns, catMap])

  // Money-Manager-style grouping by (parent category, currency): a parent's cap
  // is its OWN budget if set, else the sum of its sub-budgets; spend is the whole
  // parent (parent + subs). Sub-budgets are listed under their parent.
  const groups = useMemo(() => {
    const g = new Map()
    for (const b of recurring) {
      const cat = catMap.get(b.category_id)
      if (!cat) continue
      const parentId = cat.parent_id || cat.id
      const key = `${parentId}|${b.currency}`
      if (!g.has(key)) g.set(key, { parentId, currency: b.currency, parentBudget: null, subs: [] })
      const grp = g.get(key)
      if (cat.parent_id) grp.subs.push(b)
      else grp.parentBudget = b
    }
    const out = []
    for (const grp of g.values()) {
      const parentEff = grp.parentBudget ? (effectiveMap.get(grp.parentBudget.id)?.amount ?? 0) : 0
      const subsSum = grp.subs.reduce((s, b) => s + (effectiveMap.get(b.id)?.amount ?? 0), 0)
      const cap = parentEff > 0 ? parentEff : subsSum
      const spent = spendFor(rangeTxns, { id: grp.parentId, parent_id: null }, grp.currency)
      const rolled = grp.parentBudget ? (effectiveMap.get(grp.parentBudget.id)?.rolled ?? 0) : 0
      out.push({ ...grp, cap, spent, rolled, parentName: catMap.get(grp.parentId)?.name ?? '…' })
    }
    return out.sort((a, b) => a.parentName.localeCompare(b.parentName))
  }, [recurring, catMap, effectiveMap, rangeTxns])

  // Per-currency subtotal = sum of each group's cap + whole-parent spend.
  const subtotals = useMemo(() => {
    const m = new Map()
    for (const grp of groups) {
      if (!m.has(grp.currency)) m.set(grp.currency, { currency: grp.currency, budgeted: 0, spent: 0 })
      const s = m.get(grp.currency)
      s.budgeted += grp.cap
      s.spent += grp.spent
    }
    return [...m.values()]
  }, [groups])

  const unbudgeted = useMemo(() => {
    const have = new Set()
    for (const grp of groups) have.add(`${grp.parentId}|${grp.currency}`)
    const out = []
    for (const { pid, currency, spent } of rollup.values()) {
      if (spent <= 0 || have.has(`${pid}|${currency}`)) continue
      if (!catMap.has(pid)) continue
      out.push({ pid, currency, spent })
    }
    return out.sort((a, b) => b.spent - a.spent)
  }, [rollup, groups, catMap])

  const tISO = todayISO()
  const customRows = useMemo(() => {
    return customBudgets
      .map((b) => {
        const spent = spendFor(customTxns, catMap.get(b.category_id), b.currency, { start: b.start_date, end: b.end_date })
        return { b, spent, state: windowState(b.start_date, b.end_date, tISO) }
      })
      .sort((a, b) => (a.b.start_date < b.b.start_date ? 1 : -1))
  }, [customBudgets, customTxns, tISO, catMap])
  const activeCustom = customRows.filter((r) => r.state !== 'past')
  const pastCustom = customRows.filter((r) => r.state === 'past')

  // Apply a per-month amount change for a monthly budget (Budget v2).
  async function applySchedule(budget, monthStart, amount, scope) {
    const entries = entriesByBudget.get(budget.id) ?? []
    if (scope === 'month') {
      const next = nextMonthISO(monthStart)
      const hasNext = entries.some((e) => e.from_month === next)
      const prevNext = amountForMonth(budget, entries, next)
      await upsertBudgetAmount(user.id, budget.id, monthStart, amount)
      if (!hasNext) await upsertBudgetAmount(user.id, budget.id, next, prevNext)
    } else {
      await upsertBudgetAmount(user.id, budget.id, monthStart, amount)
    }
  }

  async function saveBudget(payload, id, scheduleOp) {
    if (id) {
      await updateBudget(id, payload)
      if (scheduleOp) await applySchedule(budgets.find((b) => b.id === id) ?? { id, amount: 0 }, scheduleOp.month, scheduleOp.amount, scheduleOp.scope)
    } else {
      await createBudget(user.id, payload)
    }
    setSheet(null)
    reloadAll()
  }
  async function doDelete() {
    await deleteBudget(confirmDel.id)
    setConfirmDel(null)
    setSheet(null)
    reloadAll()
  }

  const hasAny = budgets.length > 0
  const goPrev = () => setAnchor((a) => shiftAnchor(period, a, -1))
  const goNext = () => setAnchor((a) => shiftAnchor(period, a, 1))
  const periodLabel = (p) => t(`budget.period.${p}`)
  const thisPeriodLabel = t(`budget.thisPeriod.${period}`)

  return (
    <div className="max-w-[760px] mx-auto">
      <div className="pb-3">
        <div className="relative flex items-center justify-center gap-1">
          <button onClick={goPrev} aria-label={t('common.back')}
            className="w-8 h-8 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <button onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 font-bold text-[14px] px-3 py-1 rounded-[10px] hover:bg-surface-2 whitespace-nowrap">
            {periodLabel(period)} · {range.label}
            <ChevronDown className="w-4 h-4 text-muted" />
          </button>
          <button onClick={goNext} aria-label={t('month.next')}
            className="w-8 h-8 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
            <ChevronRight />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute top-full mt-1 z-20 bg-surface border border-border rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                {RECURRING.map((p) => (
                  <button key={p} onClick={() => { setPeriod(p); setMenuOpen(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-surface-2 ${period === p ? 'text-primary' : 'text-text'}`}>
                    {periodLabel(p)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted text-center py-10">{t('common.loading')}</p>
      ) : (
        <>
          <Button className="w-full mb-4" onClick={() => setSheet({ prefill: { period } })}>
            <PlusIcon className="w-[18px] h-[18px]" /> {t('budget.addBudget')}
          </Button>

          {!hasAny && (
            <div className="bg-surface border border-border rounded-[14px] p-6 text-center">
              <p className="text-sm text-muted">{t('budget.emptyDesc')}</p>
            </div>
          )}

          <SwipePager enabled onPrev={goPrev} onNext={goNext} className="min-w-0">
          {subtotals.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {subtotals.map((s) => {
                const st = budgetStatus(s.spent, s.budgeted)
                return (
                  <div key={s.currency} className="bg-surface border border-border rounded-[14px] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-faint">
                        {currencyList.length > 1 ? `${s.currency} · ` : ''}{thisPeriodLabel}
                      </span>
                      <span className={`text-[11px] font-semibold tabular shrink-0 ${st.over ? 'text-expense' : 'text-faint'}`}>{st.pct}%</span>
                    </div>
                    <Bar status={st} />
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1.5 text-[12px] tabular">
                      <span className="text-muted">
                        {formatMoney(s.spent, s.currency)} <span className="text-faint">{t('budget.of')}</span> {formatMoney(s.budgeted, s.currency)}
                      </span>
                      <span className={`font-semibold ${st.over ? 'text-expense' : 'text-muted'}`}>
                        {st.over ? t('budget.over', { amount: formatMoney(-st.remaining, s.currency) }) : t('budget.left', { amount: formatMoney(st.remaining, s.currency) })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {groups.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {groups.map((grp) => (
                <GroupCard key={`${grp.parentId}|${grp.currency}`} t={t}
                  grp={grp}
                  multiCurrency={currencyList.length > 1}
                  catMap={catMap}
                  effectiveMap={effectiveMap}
                  rangeTxns={rangeTxns}
                  onEditParent={() => grp.parentBudget
                    ? setSheet(grp.parentBudget)
                    : setSheet({ prefill: { period, category_id: grp.parentId, currency: grp.currency } })}
                  onEditSub={(b) => setSheet(b)} />
              ))}
            </div>
          )}

          {unbudgeted.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setShowUnbudgeted((s) => !s)}
                className="text-xs font-bold uppercase tracking-wide text-faint px-1 hover:text-muted">
                {showUnbudgeted ? t('budget.unbudgetedHide', { count: unbudgeted.length }) : t('budget.unbudgetedShow', { count: unbudgeted.length })}
              </button>
              {showUnbudgeted && (
                <div className="bg-surface border border-border rounded-[14px] overflow-hidden mt-2">
                  {unbudgeted.map(({ pid, currency, spent }) => (
                    <button key={`${pid}|${currency}`}
                      onClick={() => setSheet({ prefill: { period, category_id: pid, currency } })}
                      className="w-full flex items-center gap-3 px-3.5 py-3 border-t border-border first:border-t-0 hover:bg-surface-2 text-left">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14.5px] truncate">
                          {catMap.get(pid)?.name ?? '…'}{currencyList.length > 1 ? ` · ${currency}` : ''}
                        </div>
                        <div className="text-[12px] text-muted tabular">{t('budget.spent', { amount: formatMoney(spent, currency) })}</div>
                      </div>
                      <span className="text-[12px] font-semibold text-primary shrink-0">{t('budget.setBudget')} ›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </SwipePager>

          {(activeCustom.length > 0 || pastCustom.length > 0) && (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-faint mt-6 mb-2 px-1">{t('budget.oneOffHeader')}</div>
              {activeCustom.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {activeCustom.map(({ b, spent, state }) => (
                    <BudgetCard key={b.id} t={t}
                      title={b.label?.trim() || (catMap.get(b.category_id)?.name ?? '…')}
                      badge={state === 'upcoming' ? <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-primary">{t('budget.upcoming')}</span> : undefined}
                      subtitle={oneOffSubtitle(b, catMap, currencyList.length > 1, dateFmt)}
                      spent={spent} amount={Number(b.amount)} currency={b.currency}
                      onEdit={() => setSheet(b)} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted px-1">{t('budget.noActiveOneOff')}</p>
              )}

              {pastCustom.length > 0 && (
                <div className="mt-3">
                  <button onClick={() => setShowPast((s) => !s)}
                    className="text-xs font-bold uppercase tracking-wide text-faint px-1 hover:text-muted">
                    {showPast ? t('budget.pastHide', { count: pastCustom.length }) : t('budget.pastShow', { count: pastCustom.length })}
                  </button>
                  {showPast && (
                    <div className="flex flex-col gap-2.5 mt-2">
                      {pastCustom.map(({ b, spent }) => (
                        <BudgetCard key={b.id} t={t} dim
                          title={b.label?.trim() || (catMap.get(b.category_id)?.name ?? '…')}
                          subtitle={oneOffSubtitle(b, catMap, currencyList.length > 1, dateFmt)}
                          spent={spent} amount={Number(b.amount)} currency={b.currency}
                          onEdit={() => setSheet(b)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {sheet && (
        <BudgetSheet
          t={t}
          initial={sheet.id ? sheet : null}
          prefill={sheet.prefill ?? null}
          catOptions={catOptions}
          currencyList={currencyList}
          base={base}
          budgets={budgets}
          viewMonthStart={range.start}
          viewMonthLabel={range.label}
          monthAmountFor={(b) => amountForMonth(b, entriesByBudget.get(b.id), range.start)}
          onSave={saveBudget}
          onAskDelete={(b) => setConfirmDel(b)}
          onClose={() => setSheet(null)}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title={t('budget.deleteTitle')}
          message={t('budget.deleteMessage')}
          confirmLabel={t('common.delete')}
          onConfirm={doDelete}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}

function oneOffSubtitle(b, catMap, multiCurrency, dateFmt) {
  const parts = []
  if (b.label?.trim()) parts.push(catMap.get(b.category_id)?.name ?? '…')
  if (multiCurrency) parts.push(b.currency)
  parts.push(`${formatDate(b.start_date, dateFmt)} – ${formatDate(b.end_date, dateFmt)}`)
  return parts.join(' · ')
}

function Bar({ status }) {
  return (
    <div className="h-2 rounded-full bg-surface-2 mt-2 overflow-hidden">
      <div className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.round(status.ratio * 100))}%`, background: status.color }} />
    </div>
  )
}

// A parent group: the parent's roll-up card + a row per sub-category budget.
function GroupCard({ t, grp, multiCurrency, catMap, effectiveMap, rangeTxns, onEditParent, onEditSub }) {
  const st = budgetStatus(grp.spent, grp.cap)
  const subtitle = [multiCurrency ? grp.currency : null, grp.parentBudget ? null : t('budget.sumOfSubs')].filter(Boolean).join(' · ')
  return (
    <div className="bg-surface border border-border rounded-[14px] px-4 py-3">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[14.5px] truncate">{grp.parentName}</div>
          {subtitle && <div className="text-[12px] text-muted truncate">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0 -mr-1.5 -mt-1">
          <span className={`text-[11px] font-semibold tabular ${st.over ? 'text-expense' : 'text-faint'}`}>{st.pct}%</span>
          <button onClick={onEditParent} aria-label={t('budget.editBudget')}
            className="w-8 h-8 rounded-[9px] grid place-items-center text-muted hover:bg-surface-2">
            <PencilIcon className="w-[16px] h-[16px]" />
          </button>
        </div>
      </div>
      {grp.rolled !== 0 && (
        <div className={`text-[11px] tabular truncate mt-0.5 ${grp.rolled > 0 ? 'text-primary' : 'text-expense'}`}>
          {grp.rolled > 0 ? t('budget.rolledOver', { amount: formatMoney(grp.rolled, grp.currency) }) : t('budget.fromOverspend', { amount: formatMoney(-grp.rolled, grp.currency) })}
        </div>
      )}
      <Bar status={st} />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1.5 text-[12px] tabular">
        <span className="text-muted">
          {formatMoney(grp.spent, grp.currency)} <span className="text-faint">{t('budget.of')}</span> {formatMoney(grp.cap, grp.currency)}
        </span>
        <span className={`font-semibold ${st.over ? 'text-expense' : 'text-muted'}`}>
          {st.over ? t('budget.over', { amount: formatMoney(-st.remaining, grp.currency) }) : t('budget.left', { amount: formatMoney(st.remaining, grp.currency) })}
        </span>
      </div>

      {grp.subs.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-border flex flex-col gap-2.5">
          {grp.subs
            .slice()
            .sort((a, b) => (catMap.get(a.category_id)?.name ?? '').localeCompare(catMap.get(b.category_id)?.name ?? ''))
            .map((b) => {
              const eff = effectiveMap.get(b.id) ?? { amount: Number(b.amount) }
              const sp = spendFor(rangeTxns, catMap.get(b.category_id), b.currency)
              const sst = budgetStatus(sp, eff.amount)
              return (
                <button key={b.id} onClick={() => onEditSub(b)} className="text-left">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-text truncate">{catMap.get(b.category_id)?.name ?? '…'}</span>
                    <span className="text-[11px] tabular shrink-0 text-muted">
                      {formatMoney(sp, b.currency)} <span className="text-faint">{t('budget.of')}</span> {formatMoney(eff.amount, b.currency)}
                    </span>
                  </div>
                  <Bar status={sst} />
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}

// One-off / past budget card.
function BudgetCard({ t, title, subtitle, badge, spent, amount, currency, dim, onEdit }) {
  const st = budgetStatus(spent, amount)
  return (
    <div className={`bg-surface border border-border rounded-[14px] px-4 py-3 ${dim ? 'opacity-70' : ''}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[14.5px] truncate">{title}{badge}</div>
          {subtitle && <div className="text-[12px] text-muted truncate">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0 -mr-1.5 -mt-1">
          <span className={`text-[11px] font-semibold tabular ${st.over ? 'text-expense' : 'text-faint'}`}>{st.pct}%</span>
          {onEdit && (
            <button onClick={onEdit} aria-label={t('budget.editBudget')}
              className="w-8 h-8 rounded-[9px] grid place-items-center text-muted hover:bg-surface-2">
              <PencilIcon className="w-[16px] h-[16px]" />
            </button>
          )}
        </div>
      </div>
      <Bar status={st} />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1.5 text-[12px] tabular">
        <span className="text-muted">
          {formatMoney(spent, currency)} <span className="text-faint">{t('budget.of')}</span> {formatMoney(amount, currency)}
        </span>
        <span className={`font-semibold ${st.over ? 'text-expense' : 'text-muted'}`}>
          {st.over ? t('budget.over', { amount: formatMoney(-st.remaining, currency) }) : t('budget.left', { amount: formatMoney(st.remaining, currency) })}
        </span>
      </div>
    </div>
  )
}

function BudgetSheet({ t, initial, prefill, catOptions, currencyList, base, budgets, viewMonthStart, viewMonthLabel, monthAmountFor, onSave, onAskDelete, onClose }) {
  const seed = initial ?? {}
  const isEdit = !!initial
  const [kind, setKind] = useState(seed.period === 'custom' ? 'custom' : 'recurring')
  const [period, setPeriod] = useState(
    seed.period && seed.period !== 'custom' ? seed.period : (prefill?.period && prefill.period !== 'custom' ? prefill.period : 'month')
  )
  const [categoryId, setCategoryId] = useState(seed.category_id ?? prefill?.category_id ?? '')
  const [currency, setCurrency] = useState(seed.currency ?? prefill?.currency ?? base)
  // For an existing monthly budget the amount shown is the VIEWED month's amount.
  const [amount, setAmount] = useState(
    isEdit ? (seed.period === 'month' ? monthAmountFor(seed) : Number(seed.amount)) : null
  )
  const [startDate, setStartDate] = useState(seed.start_date ?? '')
  const [endDate, setEndDate] = useState(seed.end_date ?? '')
  const [label, setLabel] = useState(seed.label ?? '')
  const [rollover, setRollover] = useState(seed.rollover ?? 'none')
  const [scope, setScope] = useState('onward') // monthly edit: 'onward' | 'month'

  const ROLL_HINT = { none: t('budget.rollHint.none'), forgiving: t('budget.rollHint.forgiving'), strict: t('budget.rollHint.strict') }
  const monthlyEdit = isEdit && kind === 'recurring' && period === 'month'

  const dup = kind === 'recurring' && categoryId && budgets.some(
    (b) => b.id !== initial?.id && b.period === period && b.category_id === categoryId && b.currency === currency
  )
  const windowOk = kind === 'recurring' || (startDate && endDate && startDate <= endDate)
  const canSave = !!categoryId && !!currency && Number(amount) > 0 && windowOk && !dup

  function submit() {
    if (!canSave) return
    if (kind === 'custom') {
      onSave({ category_id: categoryId, period: 'custom', currency, amount, start_date: startDate, end_date: endDate, label: label.trim() || null, rollover: 'none' }, initial?.id)
      return
    }
    if (monthlyEdit) {
      // Keep budgets.amount as the base; write the per-month schedule.
      onSave({ category_id: categoryId, period, currency, rollover }, initial.id, { month: viewMonthStart, amount, scope })
      return
    }
    onSave({ category_id: categoryId, period, currency, amount, rollover }, initial?.id)
  }

  return (
    <Modal
      title={isEdit ? t('budget.edit') : t('budget.new')}
      onClose={onClose}
      footer={
        <>
          {isEdit && <Button variant="ghost" className="!text-expense" onClick={() => onAskDelete(initial)}>{t('common.delete')}</Button>}
          <Button variant="ghost" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button className="flex-1" onClick={submit} disabled={!canSave}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {!monthlyEdit && (
          <Segmented value={kind} onChange={setKind}
            options={[{ value: 'recurring', label: t('budget.recurring') }, { value: 'custom', label: t('budget.oneOff') }]} />
        )}

        {kind === 'recurring' ? (
          !monthlyEdit && (
            <Field label={t('budget.repeats')}>
              <Segmented value={period} onChange={setPeriod}
                options={[{ value: 'week', label: t('budget.weekly') }, { value: 'month', label: t('budget.monthly') }, { value: 'year', label: t('budget.yearly') }]} />
            </Field>
          )
        ) : (
          <>
            <Field label={t('budget.nameOptional')}>
              <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('budget.namePlaceholder')} maxLength={60} />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label={t('budget.from')}>
                <DatePicker value={startDate} onChange={setStartDate} max={endDate || undefined} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px]" />
              </Field>
              <Field label={t('budget.to')}>
                <DatePicker value={endDate} onChange={setEndDate} min={startDate || undefined} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px]" />
              </Field>
            </div>
          </>
        )}

        <Field label={t('budget.category')} hint={t('budget.categoryHint')}>
          <ResponsiveSelect title={t('budget.category')} placeholder={t('budget.chooseCategory')}
            value={categoryId} onChange={setCategoryId} options={catOptions} />
        </Field>

        {currencyList.length > 1 && (
          <Field label={t('budget.currency')} hint={t('budget.currencyHint')}>
            {currencyList.length <= 4 ? (
              <Segmented value={currency} onChange={setCurrency} options={currencyList.map((c) => ({ value: c, label: c }))} />
            ) : (
              <ResponsiveSelect title={t('budget.currency')} value={currency} onChange={setCurrency} options={currencyList.map((c) => ({ value: c, label: c }))} />
            )}
          </Field>
        )}

        <Field label={monthlyEdit ? t('budget.amountForMonth', { month: viewMonthLabel }) : t('budget.amount')}>
          <NumberInput value={amount} onChange={setAmount} locale={localeFor(currency)} currency={currency} />
        </Field>

        {monthlyEdit && (
          <Field label={t('budget.applyTo')}>
            <Segmented value={scope} onChange={setScope}
              options={[{ value: 'onward', label: t('budget.fromThisMonth') }, { value: 'month', label: t('budget.justThisMonth') }]} />
          </Field>
        )}

        {kind === 'recurring' && !monthlyEdit && (
          <Field label={t('budget.rollover')} hint={ROLL_HINT[rollover]}>
            <Segmented value={rollover} onChange={setRollover}
              options={[{ value: 'none', label: t('budget.rollOff') }, { value: 'forgiving', label: t('budget.rollForgiving') }, { value: 'strict', label: t('budget.rollStrict') }]} />
          </Field>
        )}

        {dup && <p className="text-[12px] text-expense font-semibold">{t('budget.dup')}</p>}
      </div>
    </Modal>
  )
}
