import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useMonth } from '../MonthContext'
import { listTransactionsInRange, listCategories, listRates } from '../lib/data'
import { formatMoney } from '../lib/format'
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

  const [mode, setMode] = useState('month')
  const [menuOpen, setMenuOpen] = useState(false)
  // Anchor for week/month/year navigation; seeded from the Home-selected month.
  const [anchor, setAnchor] = useState(() => new Date(year, monthIndex, 1))
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  const [txns, setTxns] = useState([])
  const [catMap, setCatMap] = useState(new Map())
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [drill, setDrill] = useState(null) // { id, name } of the opened top-level category

  const range = rangeFor(mode, anchor, periodStart, periodEnd)

  useEffect(() => {
    listCategories().then(({ data, error }) => {
      if (!error) setCatMap(new Map((data ?? []).map((c) => [c.id, c])))
    })
    listRates().then(({ data, error }) => {
      if (!error) setRates(Object.fromEntries((data ?? []).map((x) => [x.currency, Number(x.rate)])))
    })
  }, [])

  // Refetch when the range changes. The opened category is kept across range
  // changes (you can page through months while drilled in); only the back button
  // clears it. setState is deferred into the timeout to satisfy the lint rule.
  useEffect(() => {
    if (!range) {
      const id = setTimeout(() => { setTxns([]); setLoading(false) }, 0)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setLoading(true)
      listTransactionsInRange(range.start, range.end).then(({ data, error }) => {
        if (!error) setTxns(data ?? [])
        setLoading(false)
      })
    }, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, range?.start, range?.end])

  // Aggregate income/expense (base currency) + expenses grouped by top-level
  // category. Transfers are excluded; currencies without a rate are reported.
  const agg = useMemo(() => {
    let income = 0
    let expense = 0
    const missing = new Set()
    const byParent = new Map() // pid -> { id, name, total, txns: [] }
    for (const t of txns) {
      if (t.kind === 'transfer') continue
      const v = toBase(Number(t.amount) || 0, t.currency, rates, base)
      if (v == null) { missing.add(t.currency); continue }
      if (t.kind === 'income') { income += v; continue }
      // expense
      expense += v
      const c = t.category
      let pid, pname
      if (!c) { pid = '__none'; pname = 'Uncategorised' }
      else if (c.parent_id) { pid = c.parent_id; pname = catMap.get(c.parent_id)?.name ?? '…' }
      else { pid = c.id; pname = c.name }
      if (!byParent.has(pid)) byParent.set(pid, { id: pid, name: pname, total: 0, txns: [] })
      const g = byParent.get(pid)
      g.total += v
      g.txns.push(t)
    }
    const groups = [...byParent.values()].sort((a, b) => b.total - a.total)
    return { income, expense, groups, missing: [...missing] }
  }, [txns, rates, base, catMap])

  const drillGroup = drill ? agg.groups.find((g) => g.id === drill.id) || null : null

  function shift(delta) {
    setAnchor((a) => {
      const d = new Date(a)
      if (mode === 'week') d.setDate(d.getDate() + delta * 7)
      else if (mode === 'year') d.setFullYear(d.getFullYear() + delta)
      else d.setMonth(d.getMonth() + delta) // month
      return d
    })
  }

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Compact period control: ‹ [label ⌄] › — tap the label to switch
          Week / Month / Year / Custom; arrows page within the current mode. */}
      <div className="relative flex items-center justify-center gap-1">
        {mode !== 'period' && (
          <button onClick={() => shift(-1)} aria-label="Previous"
            className="w-9 h-9 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
        )}
        <button onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 font-bold text-[15px] px-3 py-1.5 rounded-[10px] hover:bg-surface-2 whitespace-nowrap">
          {mode === 'period' ? 'Custom period' : range?.label}
          <ChevronDown className="w-4 h-4 text-muted" />
        </button>
        {mode !== 'period' && (
          <button onClick={() => shift(1)} aria-label="Next"
            className="w-9 h-9 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
            <ChevronRight />
          </button>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-full mt-1 z-20 bg-surface border border-border rounded-xl shadow-lg overflow-hidden min-w-[150px]">
              {MODES.map((m) => (
                <button key={m.value} onClick={() => { setMode(m.value); setMenuOpen(false) }}
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
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <Field label="From">
            <DatePicker value={periodStart} onChange={setPeriodStart} max={periodEnd || undefined}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft" />
          </Field>
          <Field label="To">
            <DatePicker value={periodEnd} onChange={setPeriodEnd} min={periodStart || undefined}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft" />
          </Field>
        </div>
      )}

      {mode === 'period' && !range ? (
        <p className="text-sm text-muted text-center py-10">Pick a start and end date to see your stats.</p>
      ) : loading ? (
        <p className="text-sm text-muted text-center py-10">Loading…</p>
      ) : drill ? (
        <CategoryDrill name={drill.name} group={drillGroup} base={base} rates={rates} catMap={catMap}
          onBack={() => setDrill(null)} onTx={(id) => navigate(`/tx/${id}`)} />
      ) : (
        <>
          {/* Income / Expenses summary */}
          <div className="bg-surface border border-border rounded-[14px] mt-4 flex">
            <div className="flex-1 px-4 py-3.5 border-r border-border">
              <div className="text-[11px] font-semibold text-muted">Income</div>
              <div className="text-[17px] font-extrabold tabular text-income mt-0.5">{formatMoney(agg.income, base)}</div>
            </div>
            <div className="flex-1 px-4 py-3.5">
              <div className="text-[11px] font-semibold text-muted">Expenses</div>
              <div className="text-[17px] font-extrabold tabular text-expense mt-0.5">{formatMoney(agg.expense, base)}</div>
            </div>
          </div>

          {agg.missing.length > 0 && (
            <button onClick={() => navigate('/settings/rates')}
              className="w-full text-left text-[12px] text-muted bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 mt-2.5">
              {agg.missing.join(', ')} {agg.missing.length === 1 ? 'has' : 'have'} no exchange rate and {agg.missing.length === 1 ? 'is' : 'are'} excluded.
              <span className="text-primary font-semibold"> Set a rate ›</span>
            </button>
          )}

          <div className="text-xs font-bold uppercase tracking-wide text-faint mt-5 mb-2 px-1">Expenses by category</div>
          {agg.groups.length === 0 ? (
            <div className="bg-surface border border-border rounded-[14px] p-8 text-center">
              <p className="text-sm text-muted">No expenses in this period.</p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
              {agg.groups.map((g, i) => {
                const pct = agg.expense > 0 ? Math.round((g.total / agg.expense) * 100) : 0
                return (
                  <button key={g.id} onClick={() => setDrill({ id: g.id, name: g.name })}
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
      )}
    </div>
  )
}

// Drilldown for the tapped top-level category: a sub-category breakdown (only
// shown when the category actually has sub-categories) + every transaction in
// the current period. `group` is null when the category has nothing this period.
function CategoryDrill({ name, group, base, rates, catMap, onBack, onTx }) {
  const total = group?.total ?? 0
  const txns = group ? [...group.txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) : []

  // Sub-category buckets — only for real sub-categories. Charges booked directly
  // on the parent are lumped into "Other" (and only shown alongside real subs).
  const realSubs = new Map()
  let directTotal = 0
  for (const t of txns) {
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

  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-muted mt-4 mb-2 hover:text-text">
        <ChevronLeft className="w-4 h-4" /> Expenses by category
      </button>

      <div className="bg-surface border border-border rounded-[14px] px-4 py-3.5 flex justify-between items-baseline">
        <span className="font-bold text-[15px]">{name}</span>
        <span className="font-extrabold text-[15px] tabular text-expense">{formatMoney(total, base)}</span>
      </div>

      {subList.length > 0 && (
        <div className="bg-surface border border-border rounded-[14px] overflow-hidden mt-3">
          {subList.map((s) => {
            const pct = total > 0 ? Math.round((s.total / total) * 100) : 0
            return (
              <div key={s.key} className="flex justify-between items-baseline px-3.5 py-2.5 border-t border-border first:border-t-0">
                <span className="text-[14px] font-semibold truncate min-w-0">{s.name}</span>
                <span className="text-right shrink-0 pl-3">
                  <span className="font-bold text-[14px] tabular">{formatMoney(s.total, base)}</span>
                  <span className="text-[11px] text-muted ml-2">{pct}%</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {txns.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">No expenses in this category for this period.</p>
      ) : (
        <>
          <div className="text-xs font-bold uppercase tracking-wide text-faint mt-5 mb-2 px-1">Transactions</div>
          <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
            {txns.map((t) => (
              <button key={t.id} onClick={() => onTx(t.id)}
                className="w-full flex gap-3 px-3.5 py-2.5 border-t border-border first:border-t-0 hover:bg-surface-2 text-left">
                <TxRowContent t={t} catMap={catMap} />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
