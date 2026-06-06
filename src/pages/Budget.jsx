import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../AuthContext'
import {
  listBudgets, listCategories, listAccounts, listTransactionsInRange,
  createBudget, updateBudget, deleteBudget,
} from '../lib/data'
import {
  periodRange, shiftAnchor, endExclusive, spendFor, rollupByParentCurrency,
  budgetStatus, windowState, carryover, PERIOD_LABEL,
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

// Plain-language explanation of each rollover mode, shown under the picker.
const ROLL_HINT = {
  none: 'Each period starts fresh at the set amount.',
  forgiving: 'Unused budget carries to the next period. If you overspend, it’s forgiven — the next period still starts at the full amount.',
  strict: 'Unused budget carries forward, and overspending carries too — the next period is reduced by what you went over (YNAB-style).',
}

const pad = (n) => String(n).padStart(2, '0')
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

export default function Budget() {
  const { user, profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const dateFmt = profile?.date_format ?? 'dmy'

  const [period, setPeriod] = useState('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [menuOpen, setMenuOpen] = useState(false)

  const [budgets, setBudgets] = useState([])
  const [cats, setCats] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const [rangeTxns, setRangeTxns] = useState([])
  const [customTxns, setCustomTxns] = useState([])
  const [histTxns, setHistTxns] = useState([])

  const [sheet, setSheet] = useState(null) // budget object | { prefill } | null
  const [confirmDel, setConfirmDel] = useState(null)
  const [showUnbudgeted, setShowUnbudgeted] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const expenseTops = useMemo(
    () => cats.filter((c) => c.kind === 'expense' && !c.parent_id && !c.archived),
    [cats]
  )
  const currencyList = useMemo(() => {
    const set = new Set(accounts.map((a) => a.currency))
    set.add(base)
    return [...set]
  }, [accounts, base])

  // Initial + post-mutation load of the small lists.
  function reloadAll() {
    return Promise.all([listBudgets(), listCategories(), listAccounts()]).then(([b, c, a]) => {
      if (!b.error) setBudgets(b.data ?? [])
      if (!c.error) setCats(c.data ?? [])
      if (!a.error) setAccounts(a.data ?? [])
      setLoading(false)
    })
  }
  useEffect(() => { reloadAll() }, [])

  // Transactions for the recurring period in view.
  const range = periodRange(period, anchor)
  useEffect(() => {
    let alive = true
    listTransactionsInRange(range.start, range.end).then(({ data, error }) => {
      if (alive && !error) setRangeTxns(data ?? [])
    })
    return () => { alive = false }
  }, [period, range.start, range.end])

  // Transactions spanning all custom windows (one fetch over their union range).
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

  // Historical transactions for any rollover budgets in view: one fetch over
  // [earliest budget-creation period start, viewed period start).
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

  // Effective cap per recurring budget = base amount + rollover carried in.
  const effectiveMap = useMemo(() => {
    const m = new Map()
    for (const b of recurring) {
      const rolled = b.rollover && b.rollover !== 'none' ? carryover(b, histTxns, range.start) : 0
      m.set(b.id, { amount: Number(b.amount) + rolled, rolled })
    }
    return m
  }, [recurring, histTxns, range.start])

  // Per-currency subtotals for the recurring budgets in view (effective caps).
  const subtotals = useMemo(() => {
    const m = new Map()
    for (const b of recurring) {
      const spent = rollup.get(`${b.category_id}|${b.currency}`)?.spent ?? 0
      const eff = effectiveMap.get(b.id)?.amount ?? Number(b.amount)
      if (!m.has(b.currency)) m.set(b.currency, { currency: b.currency, budgeted: 0, spent: 0 })
      const s = m.get(b.currency)
      s.budgeted += eff
      s.spent += spent
    }
    return [...m.values()]
  }, [recurring, rollup, effectiveMap])

  // Categories with spend this period but no budget set for (category, currency).
  const unbudgeted = useMemo(() => {
    const have = new Set(recurring.map((b) => `${b.category_id}|${b.currency}`))
    const out = []
    for (const { pid, currency, spent } of rollup.values()) {
      if (spent <= 0 || have.has(`${pid}|${currency}`)) continue
      if (!catMap.has(pid)) continue
      out.push({ pid, currency, spent })
    }
    return out.sort((a, b) => b.spent - a.spent)
  }, [rollup, recurring, catMap])

  const tISO = todayISO()
  const customRows = useMemo(() => {
    return customBudgets
      .map((b) => {
        const spent = spendFor(customTxns, b.category_id, b.currency, { start: b.start_date, end: b.end_date })
        return { b, spent, state: windowState(b.start_date, b.end_date, tISO) }
      })
      .sort((a, b) => (a.b.start_date < b.b.start_date ? 1 : -1))
  }, [customBudgets, customTxns, tISO])
  const activeCustom = customRows.filter((r) => r.state !== 'past')
  const pastCustom = customRows.filter((r) => r.state === 'past')

  async function saveBudget(payload, id) {
    if (id) await updateBudget(id, payload)
    else await createBudget(user.id, payload)
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

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Recurring period control: ‹ [label ⌄] › — tap label to switch Week/Month/Year. */}
      <div className="pb-3">
        <div className="relative flex items-center justify-center gap-1">
          <button onClick={goPrev} aria-label="Previous"
            className="w-8 h-8 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <button onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 font-bold text-[14px] px-3 py-1 rounded-[10px] hover:bg-surface-2 whitespace-nowrap">
            {PERIOD_LABEL[period]} · {range.label}
            <ChevronDown className="w-4 h-4 text-muted" />
          </button>
          <button onClick={goNext} aria-label="Next"
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
                    {PERIOD_LABEL[p]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted text-center py-10">Loading…</p>
      ) : (
        <>
          <Button className="w-full mb-4" onClick={() => setSheet({ prefill: { period } })}>
            <PlusIcon className="w-[18px] h-[18px]" /> Add budget
          </Button>

          {!hasAny && (
            <div className="bg-surface border border-border rounded-[14px] p-6 text-center">
              <p className="text-sm text-muted">
                No budgets yet. Set a spending cap per category — recurring (week/month/year) or a one-off window like a trip.
              </p>
            </div>
          )}

          <SwipePager enabled onPrev={goPrev} onNext={goNext} className="min-w-0">
          {/* Per-currency subtotals for this period */}
          {subtotals.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {subtotals.map((s) => {
                const st = budgetStatus(s.spent, s.budgeted)
                return (
                  <div key={s.currency} className="bg-surface border border-border rounded-[14px] px-4 py-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-faint">
                        {currencyList.length > 1 ? `${s.currency} · ` : ''}This {period}
                      </span>
                      <span className="text-[12px] font-semibold text-muted tabular">
                        {formatMoney(s.spent, s.currency)} <span className="text-faint">of</span> {formatMoney(s.budgeted, s.currency)}
                      </span>
                    </div>
                    <Bar status={st} />
                    <div className="flex justify-between items-baseline mt-1.5">
                      <span className={`text-[12px] font-semibold tabular ${st.over ? 'text-expense' : 'text-muted'}`}>
                        {st.over ? `Over by ${formatMoney(-st.remaining, s.currency)}` : `${formatMoney(st.remaining, s.currency)} left`}
                      </span>
                      <span className="text-[11px] text-faint tabular">{st.pct}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recurring budget rows */}
          {recurring.length > 0 && (
            <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
              {recurring
                .slice()
                .sort((a, b) => (catMap.get(a.category_id)?.name ?? '').localeCompare(catMap.get(b.category_id)?.name ?? ''))
                .map((b) => (
                  <BudgetRow key={b.id} budget={b} catMap={catMap}
                    spent={rollup.get(`${b.category_id}|${b.currency}`)?.spent ?? 0}
                    effectiveAmount={effectiveMap.get(b.id)?.amount ?? Number(b.amount)}
                    rolled={effectiveMap.get(b.id)?.rolled ?? 0}
                    showCurrency={currencyList.length > 1}
                    onEdit={() => setSheet(b)} />
                ))}
            </div>
          )}

          {/* Categories with spend but no budget */}
          {unbudgeted.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setShowUnbudgeted((s) => !s)}
                className="text-xs font-bold uppercase tracking-wide text-faint px-1 hover:text-muted">
                {showUnbudgeted ? 'Hide' : 'Show'} categories with spending and no budget ({unbudgeted.length})
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
                        <div className="text-[12px] text-muted tabular">{formatMoney(spent, currency)} spent</div>
                      </div>
                      <span className="text-[12px] font-semibold text-primary shrink-0">Set budget ›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </SwipePager>

          {/* One-off budgets */}
          {(activeCustom.length > 0 || pastCustom.length > 0) && (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-faint mt-6 mb-2 px-1">One-off budgets</div>
              {activeCustom.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {activeCustom.map(({ b, spent, state }) => (
                    <CustomCard key={b.id} budget={b} catMap={catMap} spent={spent} state={state}
                      dateFmt={dateFmt} showCurrency={currencyList.length > 1} onEdit={() => setSheet(b)} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted px-1">No active one-off budgets.</p>
              )}

              {pastCustom.length > 0 && (
                <div className="mt-3">
                  <button onClick={() => setShowPast((s) => !s)}
                    className="text-xs font-bold uppercase tracking-wide text-faint px-1 hover:text-muted">
                    {showPast ? 'Hide' : 'Show'} past ({pastCustom.length})
                  </button>
                  {showPast && (
                    <div className="flex flex-col gap-2.5 mt-2">
                      {pastCustom.map(({ b, spent, state }) => (
                        <CustomCard key={b.id} budget={b} catMap={catMap} spent={spent} state={state}
                          dateFmt={dateFmt} showCurrency={currencyList.length > 1} onEdit={() => setSheet(b)} />
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
          initial={sheet.id ? sheet : null}
          prefill={sheet.prefill ?? null}
          categories={expenseTops}
          currencyList={currencyList}
          base={base}
          budgets={budgets}
          onSave={saveBudget}
          onAskDelete={(b) => setConfirmDel(b)}
          onClose={() => setSheet(null)}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete this budget?"
          message="The budget is removed. Your transactions are not touched."
          confirmLabel="Delete"
          onConfirm={doDelete}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}

function Bar({ status }) {
  return (
    <div className="h-2 rounded-full bg-surface-2 mt-2 overflow-hidden">
      <div className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.round(status.ratio * 100))}%`, background: status.color }} />
    </div>
  )
}

function BudgetRow({ budget, catMap, spent, effectiveAmount, rolled = 0, showCurrency, onEdit }) {
  const amount = effectiveAmount ?? Number(budget.amount)
  const st = budgetStatus(spent, amount)
  const name = catMap.get(budget.category_id)?.name ?? '…'
  const cur = budget.currency
  return (
    <div className="w-full flex items-center gap-2 px-3.5 py-3 border-t border-border first:border-t-0">
      <div className="flex-1 min-w-0">
        {/* Title line: name takes the row; only the short % shares it. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-[14.5px] truncate min-w-0">
            {name}{showCurrency && <span className="text-faint font-normal"> · {cur}</span>}
          </span>
          <span className={`text-[11px] font-semibold tabular shrink-0 ${st.over ? 'text-expense' : 'text-faint'}`}>{st.pct}%</span>
        </div>
        {rolled !== 0 && (
          <div className={`text-[11px] tabular truncate ${rolled > 0 ? 'text-primary' : 'text-expense'}`}>
            {rolled > 0 ? `+${formatMoney(rolled, cur)} rolled over` : `−${formatMoney(-rolled, cur)} from overspend`}
          </div>
        )}
        <Bar status={st} />
        {/* Figures live under the bar so the long IDR amounts never crowd the name. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1.5 text-[12px] tabular">
          <span className="text-muted">
            {formatMoney(spent, cur)} <span className="text-faint">of</span> {formatMoney(amount, cur)}
          </span>
          <span className={`font-semibold ${st.over ? 'text-expense' : 'text-muted'}`}>
            {st.over ? `over ${formatMoney(-st.remaining, cur)}` : `${formatMoney(st.remaining, cur)} left`}
          </span>
        </div>
      </div>
      <button onClick={onEdit} aria-label="Edit budget"
        className="w-8 h-8 rounded-[9px] grid place-items-center shrink-0 text-muted hover:bg-surface-2">
        <PencilIcon className="w-[16px] h-[16px]" />
      </button>
    </div>
  )
}

function CustomCard({ budget, catMap, spent, state, dateFmt, showCurrency, onEdit }) {
  const st = budgetStatus(spent, Number(budget.amount))
  const catName = catMap.get(budget.category_id)?.name ?? '…'
  const title = budget.label?.trim() || catName
  return (
    <div className={`bg-surface border border-border rounded-[14px] px-4 py-3 ${state === 'past' ? 'opacity-70' : ''}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[14.5px] truncate">
            {title}
            {state === 'upcoming' && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-primary">Upcoming</span>}
          </div>
          <div className="text-[12px] text-muted truncate">
            {budget.label?.trim() ? `${catName} · ` : ''}{showCurrency ? `${budget.currency} · ` : ''}
            {formatDate(budget.start_date, dateFmt)} – {formatDate(budget.end_date, dateFmt)}
          </div>
        </div>
        {/* % spent sits by the title (with the bar), never next to "X left". */}
        <div className="flex items-center gap-1 shrink-0 -mr-1.5 -mt-1">
          <span className={`text-[11px] font-semibold tabular ${st.over ? 'text-expense' : 'text-faint'}`}>{st.pct}%</span>
          <button onClick={onEdit} aria-label="Edit budget"
            className="w-8 h-8 rounded-[9px] grid place-items-center text-muted hover:bg-surface-2">
            <PencilIcon className="w-[16px] h-[16px]" />
          </button>
        </div>
      </div>
      <Bar status={st} />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1.5 text-[12px] tabular">
        <span className="text-muted">
          {formatMoney(spent, budget.currency)} <span className="text-faint">of</span> {formatMoney(Number(budget.amount), budget.currency)}
        </span>
        <span className={`font-semibold ${st.over ? 'text-expense' : 'text-muted'}`}>
          {st.over ? `over ${formatMoney(-st.remaining, budget.currency)}` : `${formatMoney(st.remaining, budget.currency)} left`}
        </span>
      </div>
    </div>
  )
}

// Create / edit sheet. `initial` = existing budget (edit), else null. `prefill`
// seeds a new budget (period, and optionally category/currency from "Set budget").
function BudgetSheet({ initial, prefill, categories, currencyList, base, budgets, onSave, onAskDelete, onClose }) {
  const seed = initial ?? {}
  const [kind, setKind] = useState(seed.period === 'custom' ? 'custom' : 'recurring')
  const [period, setPeriod] = useState(
    seed.period && seed.period !== 'custom' ? seed.period : (prefill?.period && prefill.period !== 'custom' ? prefill.period : 'month')
  )
  const [categoryId, setCategoryId] = useState(seed.category_id ?? prefill?.category_id ?? '')
  const [currency, setCurrency] = useState(seed.currency ?? prefill?.currency ?? base)
  const [amount, setAmount] = useState(seed.amount != null ? Number(seed.amount) : null)
  const [startDate, setStartDate] = useState(seed.start_date ?? '')
  const [endDate, setEndDate] = useState(seed.end_date ?? '')
  const [label, setLabel] = useState(seed.label ?? '')
  const [rollover, setRollover] = useState(seed.rollover ?? 'none')

  const catOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const isEdit = !!initial

  // Duplicate guard for recurring budgets (one per category+currency+period).
  const dup = kind === 'recurring' && categoryId && budgets.some(
    (b) => b.id !== initial?.id && b.period === period && b.category_id === categoryId && b.currency === currency
  )
  const windowOk = kind === 'recurring' || (startDate && endDate && startDate <= endDate)
  const canSave = !!categoryId && !!currency && Number(amount) > 0 && windowOk && !dup

  function submit() {
    if (!canSave) return
    const payload = kind === 'custom'
      ? { category_id: categoryId, period: 'custom', currency, amount, start_date: startDate, end_date: endDate, label: label.trim() || null, rollover: 'none' }
      : { category_id: categoryId, period, currency, amount, rollover }
    onSave(payload, initial?.id)
  }

  return (
    <Modal
      title={isEdit ? 'Edit budget' : 'New budget'}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <Button variant="ghost" className="!text-expense" onClick={() => onAskDelete(initial)}>Delete</Button>
          )}
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={submit} disabled={!canSave}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[{ value: 'recurring', label: 'Recurring' }, { value: 'custom', label: 'One-off' }]}
        />

        {kind === 'recurring' ? (
          <Field label="Repeats">
            <Segmented value={period} onChange={setPeriod}
              options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />
          </Field>
        ) : (
          <>
            <Field label="Name (optional)">
              <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Bali trip" maxLength={60} />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="From">
                <DatePicker value={startDate} onChange={setStartDate} max={endDate || undefined} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px]" />
              </Field>
              <Field label="To">
                <DatePicker value={endDate} onChange={setEndDate} min={startDate || undefined} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px]" />
              </Field>
            </div>
          </>
        )}

        <Field label="Category" hint="The category (and its sub-categories) this budget tracks.">
          <ResponsiveSelect title="Category" placeholder="Choose a category"
            value={categoryId} onChange={setCategoryId} options={catOptions} />
        </Field>

        {currencyList.length > 1 && (
          <Field label="Currency" hint="Only this currency's spending counts toward the budget.">
            {currencyList.length <= 4 ? (
              <Segmented value={currency} onChange={setCurrency}
                options={currencyList.map((c) => ({ value: c, label: c }))} />
            ) : (
              <ResponsiveSelect title="Currency" value={currency} onChange={setCurrency}
                options={currencyList.map((c) => ({ value: c, label: c }))} />
            )}
          </Field>
        )}

        <Field label="Amount">
          <NumberInput value={amount} onChange={setAmount} locale={localeFor(currency)} currency={currency} />
        </Field>

        {kind === 'recurring' && (
          <Field label="Roll unused budget over" hint={ROLL_HINT[rollover]}>
            <Segmented value={rollover} onChange={setRollover}
              options={[{ value: 'none', label: 'Off' }, { value: 'forgiving', label: 'Forgiving' }, { value: 'strict', label: 'Strict' }]} />
          </Field>
        )}

        {dup && (
          <p className="text-[12px] text-expense font-semibold">
            A {period} budget for this category and currency already exists.
          </p>
        )}
      </div>
    </Modal>
  )
}
