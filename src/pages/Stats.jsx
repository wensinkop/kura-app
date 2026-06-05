import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useMonth } from '../MonthContext'
import { listTransactionsInRange, listCategories, listRates } from '../lib/data'
import { cacheGet, cacheSet } from '../lib/cache'
import { formatMoney, dayLabel } from '../lib/format'
import { toBase } from '../lib/balances'
import { Field } from '../components/ui'
import DatePicker from '../components/DatePicker'
import TxRowContent from '../components/TxRowContent'
import { ChevronLeft, ChevronRight, ChevronDown } from '../lib/icons'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MODES = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'period', label: 'Custom period' },
]

// Colour palette for the category proportion bars (matches the locked design).
const PALETTE = ['#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#ef4444', '#3b82f6', '#a3a3a3']

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
const isoOfDate = (dt) => iso(dt.getFullYear(), dt.getMonth(), dt.getDate())
const addDays = (dt, n) => { const d = new Date(dt); d.setDate(d.getDate() + n); return d }
// Monday-start week containing `dt`.
const weekStart = (dt) => { const d = new Date(dt); const dow = (d.getDay() + 6) % 7; return addDays(d, -dow) }
const shortDay = (dt) => `${dt.getDate()} ${dt.toLocaleDateString('en-US', { month: 'short' })}`
const parseAnchor = (s, fallback) => {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
  return fallback
}

// Resolve { start, end (exclusive), label } for the current mode + anchor.
function rangeFor(mode, anchor, periodStart, periodEnd) {
  if (mode === 'week') {
    const s = weekStart(anchor)
    const e = addDays(s, 7)
    const last = addDays(e, -1)
    return { start: isoOfDate(s), end: isoOfDate(e), label: `${shortDay(s)} – ${shortDay(last)} ${last.getFullYear()}` }
  }
  if (mode === 'year') {
    const y = anchor.getFullYear()
    return { start: iso(y, 0, 1), end: iso(y + 1, 0, 1), label: String(y) }
  }
  if (mode === 'period') {
    if (!periodStart || !periodEnd || periodStart > periodEnd) return null
    const [ey, em, ed] = periodEnd.split('-').map(Number)
    const endEx = isoOfDate(addDays(new Date(ey, em - 1, ed), 1))
    return { start: periodStart, end: endEx, label: 'Custom period' }
  }
  // month
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  return { start: iso(y, m, 1), end: m === 11 ? iso(y + 1, 0, 1) : iso(y, m + 1, 1), label: `${MONTHS[m]} ${y}` }
}

export default function Stats() {
  const { profile } = useAuth()
  const { year, monthIndex } = useMonth()
  const navigate = useNavigate()
  const base = profile?.base_currency ?? 'IDR'

  // The whole view state lives in the URL so the back button and a saved
  // transaction return you to exactly where you were — the period you were
  // viewing AND the drilled-in category/sub-category. Opening a category pushes
  // a history entry (so device-back closes the drill); period/view/sub tweaks
  // replace it (no history spam).
  const [sp, setSp] = useSearchParams()
  const mode = sp.get('mode') || 'month'
  const view = sp.get('v') === 'income' ? 'income' : 'expense'
  const periodStart = sp.get('ps') || ''
  const periodEnd = sp.get('pe') || ''
  const anchor = useMemo(() => parseAnchor(sp.get('a'), new Date(year, monthIndex, 1)), [sp, year, monthIndex])
  const drillCat = sp.get('cat')
  const drillKind = sp.get('kind') === 'income' ? 'income' : 'expense'
  const drillSub = sp.get('sub') || null

  const range = rangeFor(mode, anchor, periodStart, periodEnd)
  const rangeKey = range ? `range:${range.start}:${range.end}` : null

  const [menuOpen, setMenuOpen] = useState(false)
  // Seed from the session cache so revisiting a period is instant.
  const [txns, setTxns] = useState(() => (rangeKey && cacheGet(rangeKey)) || [])
  const [catMap, setCatMap] = useState(() => new Map((cacheGet('categories') ?? []).map((c) => [c.id, c])))
  const [rates, setRates] = useState(() => Object.fromEntries((cacheGet('rates') ?? []).map((x) => [x.currency, Number(x.rate)])))
  const [loading, setLoading] = useState(() => !(rangeKey && cacheGet(rangeKey) !== undefined))

  // Merge a patch into the URL params (deleting empty values). `push` adds a new
  // history entry (used when opening a category); everything else replaces.
  function update(patch, { push = false } = {}) {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k)
        else next.set(k, v)
      }
      return next
    }, { replace: !push })
  }

  useEffect(() => {
    listCategories().then(({ data, error }) => {
      if (!error) { setCatMap(new Map((data ?? []).map((c) => [c.id, c]))); cacheSet('categories', data ?? []) }
    })
    listRates().then(({ data, error }) => {
      if (!error) { setRates(Object.fromEntries((data ?? []).map((x) => [x.currency, Number(x.rate)]))); cacheSet('rates', data ?? []) }
    })
  }, [])

  // Refetch when the period changes (not when drilling — that's derived from the
  // already-loaded transactions). setState is deferred to satisfy the lint rule.
  useEffect(() => {
    if (!range) {
      const id = setTimeout(() => { setTxns([]); setLoading(false) }, 0)
      return () => clearTimeout(id)
    }
    const key = `range:${range.start}:${range.end}`
    const id = setTimeout(() => {
      const cached = cacheGet(key)
      if (cached !== undefined) { setTxns(cached); setLoading(false) } else { setLoading(true) }
      listTransactionsInRange(range.start, range.end).then(({ data, error }) => {
        if (!error) { setTxns(data ?? []); cacheSet(key, data ?? []) }
        setLoading(false)
      })
    }, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, range?.start, range?.end])

  // Aggregate income/expense (base currency) + both grouped by top-level
  // category. Transfers are excluded; currencies without a rate are reported.
  const agg = useMemo(() => {
    let income = 0
    let expense = 0
    const missing = new Set()
    const incByParent = new Map() // pid -> { id, name, total, txns: [] }
    const expByParent = new Map()
    const bucket = (map, t, v) => {
      const c = t.category
      let pid, pname
      if (!c) { pid = '__none'; pname = 'Uncategorised' }
      else if (c.parent_id) { pid = c.parent_id; pname = catMap.get(c.parent_id)?.name ?? '…' }
      else { pid = c.id; pname = c.name }
      if (!map.has(pid)) map.set(pid, { id: pid, name: pname, total: 0, txns: [] })
      const g = map.get(pid)
      g.total += v
      g.txns.push(t)
    }
    for (const t of txns) {
      if (t.kind === 'transfer') continue
      const v = toBase(Number(t.amount) || 0, t.currency, rates, base)
      if (v == null) { missing.add(t.currency); continue }
      if (t.kind === 'income') { income += v; bucket(incByParent, t, v) }
      else { expense += v; bucket(expByParent, t, v) }
    }
    const sortG = (m) => [...m.values()].sort((a, b) => b.total - a.total)
    return { income, expense, incomeGroups: sortG(incByParent), expenseGroups: sortG(expByParent), missing: [...missing] }
  }, [txns, rates, base, catMap])

  const drillGroups = drillKind === 'income' ? agg.incomeGroups : agg.expenseGroups
  const drillGroup = drillCat ? drillGroups.find((g) => g.id === drillCat) || null : null
  const drillName = drillGroup?.name ?? catMap.get(drillCat)?.name ?? (drillCat === '__none' ? 'Uncategorised' : '…')

  function shift(delta) {
    const d = new Date(anchor)
    if (mode === 'week') d.setDate(d.getDate() + delta * 7)
    else if (mode === 'year') d.setFullYear(d.getFullYear() + delta)
    else d.setMonth(d.getMonth() + delta) // month
    update({ a: isoOfDate(d) })
  }

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Sticky top block: compact period control + Income/Expenses tabs, so
          both stay visible while the category list scrolls. -mt-5 cancels the
          main's pt-5 so the top gap is this block's own padding only —
          constant whether scrolled or not. */}
      <div className="sticky top-0 z-20 bg-bg -mt-[calc(1.25rem_+_env(safe-area-inset-top))] desk:mt-0 pt-[calc(0.75rem_+_env(safe-area-inset-top))] desk:pt-3 pb-2">
      {/* Compact period control: ‹ [label ⌄] › — tap the label to switch
          Week / Month / Year / Custom; arrows page within the current mode. */}
      <div className="relative flex items-center justify-center gap-1">
        {mode !== 'period' && (
          <button onClick={() => shift(-1)} aria-label="Previous"
            className="w-8 h-8 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
        )}
        <button onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 font-bold text-[14px] px-3 py-1 rounded-[10px] hover:bg-surface-2 whitespace-nowrap">
          {mode === 'period' ? 'Custom period' : range?.label}
          <ChevronDown className="w-4 h-4 text-muted" />
        </button>
        {mode !== 'period' && (
          <button onClick={() => shift(1)} aria-label="Next"
            className="w-8 h-8 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
            <ChevronRight />
          </button>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-full mt-1 z-20 bg-surface border border-border rounded-xl shadow-lg overflow-hidden min-w-[150px]">
              {MODES.map((m) => (
                <button key={m.value} onClick={() => { update({ mode: m.value === 'month' ? null : m.value }); setMenuOpen(false) }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-surface-2 ${
                    mode === m.value ? 'text-primary' : 'text-text'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {mode === 'period' && (
        <div className="grid grid-cols-2 gap-2.5 mt-2.5">
          <Field label="From">
            <DatePicker value={periodStart} onChange={(v) => update({ ps: v })} max={periodEnd || undefined}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft" />
          </Field>
          <Field label="To">
            <DatePicker value={periodEnd} onChange={(v) => update({ pe: v })} min={periodStart || undefined}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft" />
          </Field>
        </div>
      )}

      {/* Compact Expenses / Income totals double as tabs — tap to switch breakdown */}
      {!loading && !drillCat && range && (
        <div className="bg-surface border border-border rounded-xl mt-2.5 flex overflow-hidden">
          <button onClick={() => update({ v: null })}
            className={`flex-1 px-3 py-2 text-left border-r border-border relative ${view === 'expense' ? '' : 'opacity-50'}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">Expenses</div>
            <div className="text-[14px] font-extrabold tabular text-expense leading-tight mt-0.5">{formatMoney(agg.expense, base)}</div>
            {view === 'expense' && <span className="absolute left-0 right-0 bottom-0 h-[2.5px] bg-expense" />}
          </button>
          <button onClick={() => update({ v: 'income' })}
            className={`flex-1 px-3 py-2 text-left relative ${view === 'income' ? '' : 'opacity-50'}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">Income</div>
            <div className="text-[14px] font-extrabold tabular text-income leading-tight mt-0.5">{formatMoney(agg.income, base)}</div>
            {view === 'income' && <span className="absolute left-0 right-0 bottom-0 h-[2.5px] bg-income" />}
          </button>
        </div>
      )}
      </div>

      {mode === 'period' && !range ? (
        <p className="text-sm text-muted text-center py-10">Pick a start and end date to see your stats.</p>
      ) : loading ? (
        <p className="text-sm text-muted text-center py-10">Loading…</p>
      ) : drillCat ? (
        <CategoryDrill name={drillName} kind={drillKind} group={drillGroup} base={base} rates={rates} catMap={catMap}
          sub={drillSub} onSelectSub={(k) => update({ sub: k })}
          onBack={() => navigate(-1)} onTx={(id) => navigate(`/tx/${id}`)} />
      ) : (
        <>
          {agg.missing.length > 0 && (
            <button onClick={() => navigate('/settings/rates')}
              className="w-full text-left text-[12px] text-muted bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 mt-2.5">
              {agg.missing.join(', ')} {agg.missing.length === 1 ? 'has' : 'have'} no exchange rate and {agg.missing.length === 1 ? 'is' : 'are'} excluded.
              <span className="text-primary font-semibold"> Set a rate ›</span>
            </button>
          )}

          {view === 'expense' ? (
            <CategoryList title="Expenses by category" kindWord="expenses" groups={agg.expenseGroups} total={agg.expense} base={base}
              onOpen={(g) => update({ cat: g.id, kind: 'expense', sub: null }, { push: true })} />
          ) : (
            <CategoryList title="Income by category" kindWord="income" groups={agg.incomeGroups} total={agg.income} base={base}
              onOpen={(g) => update({ cat: g.id, kind: 'income', sub: null }, { push: true })} />
          )}
        </>
      )}
    </div>
  )
}

// A "… by category" list with proportion bars + percentages; tap a row to drill.
function CategoryList({ title, kindWord, groups, total, base, onOpen }) {
  return (
    <>
      <div className="text-xs font-bold uppercase tracking-wide text-faint mt-5 mb-2 px-1">{title}</div>
      {groups.length === 0 ? (
        <div className="bg-surface border border-border rounded-[14px] p-6 text-center">
          <p className="text-sm text-muted">No {kindWord} in this period.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
          {groups.map((g, i) => {
            const pct = total > 0 ? Math.round((g.total / total) * 100) : 0
            return (
              <button key={g.id} onClick={() => onOpen(g)}
                className="w-full flex items-center gap-3 px-3.5 py-3 border-t border-border first:border-t-0 hover:bg-surface-2 text-left">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14.5px] truncate">{g.name}</div>
                  <div className="h-1.5 rounded-full bg-surface-2 mt-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[14.5px] tabular">{formatMoney(g.total, base)}</div>
                  <div className="text-[11px] text-muted">{pct}%</div>
                </div>
                <ChevronRight className="w-4 h-4 text-faint shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// Drilldown for the tapped top-level category: a tappable sub-category breakdown
// (only shown when the category has sub-categories) + every transaction in the
// current period, grouped by day. Tapping a sub-category filters the list to it.
// `group` is null when the category has nothing this period.
function CategoryDrill({ name, kind, group, base, rates, catMap, sub, onSelectSub, onBack, onTx }) {
  const kindWord = kind === 'income' ? 'income' : 'expenses'
  const totalColor = kind === 'income' ? 'text-income' : 'text-expense'
  const total = group?.total ?? 0
  const allTxns = group ? [...group.txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) : []

  // Sub-category buckets — only for real sub-categories. Charges booked directly
  // on the parent are lumped into "Other" (and only shown alongside real subs).
  const realSubs = new Map()
  let directTotal = 0
  for (const t of allTxns) {
    const v = toBase(Number(t.amount) || 0, t.currency, rates, base) || 0
    const c = t.category
    if (c && c.parent_id) {
      if (!realSubs.has(c.id)) realSubs.set(c.id, { key: c.id, name: c.name, total: 0 })
      realSubs.get(c.id).total += v
    } else {
      directTotal += v
    }
  }
  const subList = [...realSubs.values()].sort((a, b) => b.total - a.total)
  if (subList.length > 0 && directTotal > 0) subList.push({ key: '__other', name: 'Other', total: directTotal })

  // Filter the transaction list to the selected sub-category (or the "Other"
  // bucket of direct-on-parent charges).
  const txns = sub
    ? allTxns.filter((t) => (sub === '__other' ? !t.category?.parent_id : t.category?.id === sub))
    : allTxns

  // Group the (already newest-first) transactions by day for the date headers.
  const days = []
  const byDate = new Map()
  for (const t of txns) {
    if (!byDate.has(t.date)) { byDate.set(t.date, []); days.push(t.date) }
    byDate.get(t.date).push(t)
  }

  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-muted mt-4 mb-2 hover:text-text">
        <ChevronLeft className="w-4 h-4" /> {kind === 'income' ? 'Income' : 'Expenses'} by category
      </button>

      <div className="bg-surface border border-border rounded-[14px] px-4 py-3.5 flex justify-between items-baseline">
        <span className="font-bold text-[15px]">{name}</span>
        <span className={`font-extrabold text-[15px] tabular ${totalColor}`}>{formatMoney(total, base)}</span>
      </div>

      {subList.length > 0 && (
        <div className="bg-surface border border-border rounded-[14px] overflow-hidden mt-3">
          {subList.map((s) => {
            const pct = total > 0 ? Math.round((s.total / total) * 100) : 0
            const active = sub === s.key
            return (
              <button key={s.key} onClick={() => onSelectSub(active ? null : s.key)}
                className={`w-full flex justify-between items-baseline px-3.5 py-2.5 border-t border-border first:border-t-0 text-left hover:bg-surface-2 ${active ? 'bg-primary-soft' : ''}`}>
                <span className={`text-[14px] font-semibold truncate min-w-0 ${active ? 'text-primary' : ''}`}>{s.name}</span>
                <span className="text-right shrink-0 pl-3">
                  <span className="font-bold text-[14px] tabular">{formatMoney(s.total, base)}</span>
                  <span className="text-[11px] text-muted ml-2">{pct}%</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {sub && (
        <button onClick={() => onSelectSub(null)}
          className="text-[12px] font-semibold text-primary mt-3 hover:underline">
          ✕ Clear sub-category filter
        </button>
      )}

      {txns.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">No {kindWord} in this {sub ? 'sub-category' : 'category'} for this period.</p>
      ) : (
        <>
          <div className="text-xs font-bold uppercase tracking-wide text-faint mt-5 mb-2 px-1">Transactions</div>
          {days.map((date) => (
            <div key={date} className="mb-3">
              <div className="text-[12px] font-bold text-muted px-1 mb-1.5">{dayLabel(date)}</div>
              <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
                {byDate.get(date).map((t) => (
                  <button key={t.id} onClick={() => onTx(t.id)}
                    className="w-full flex gap-3 px-3.5 py-2.5 border-t border-border first:border-t-0 hover:bg-surface-2 text-left">
                    <TxRowContent t={t} catMap={catMap} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}
