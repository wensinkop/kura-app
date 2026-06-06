import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useMonth } from '../MonthContext'
import SwipePager from '../components/SwipePager'
import { useAccountFilter, matchesAccountFilter } from '../FilterContext'
import { listTransactionsForMonth, listCategories, listBudgets, deleteTransactions } from '../lib/data'
import { rollupByParentCurrency, budgetStatus } from '../lib/budgets'
import { cacheGet, cacheSet } from '../lib/cache'
import { formatMoney, amountColor } from '../lib/format'
import { Button, ConfirmDialog } from '../components/ui'
import TxRowContent from '../components/TxRowContent'
import { PlusIcon, TrashIcon, CloseIcon, BudgetIcon } from '../lib/icons'

// "2026-06-25" -> { num: "25", rest: "June 2026 · Wednesday" }, parsed in local
// time from the date parts (avoids UTC off-by-one).
function dayHeading(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return {
    num: String(d),
    rest: `${dt.toLocaleDateString('en-US', { month: 'long' })} ${y} · ${dt.toLocaleDateString('en-US', { weekday: 'long' })}`,
  }
}

export default function Home() {
  const { year, monthIndex, prev, next } = useMonth()
  const { accountIds } = useAccountFilter()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const monthKey = `month:${year}-${monthIndex}`
  // Seed from the session cache so revisiting a month is instant (no spinner);
  // the effect below still refetches in the background to pick up changes.
  const [txns, setTxns] = useState(() => cacheGet(monthKey) ?? [])
  const [catMap, setCatMap] = useState(() => new Map((cacheGet('categories') ?? []).map((c) => [c.id, c])))
  const [loading, setLoading] = useState(() => cacheGet(monthKey) === undefined)

  // Selection (long-press to multi-select + bulk delete).
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [deleting, setDeleting] = useState(false)


  // Monthly budgets for the Home card (only when the feature is on). Spend is
  // derived from `txns` (this month) below — no extra fetch.
  const [budgets, setBudgets] = useState([])
  useEffect(() => {
    const tid = setTimeout(() => {
      if (!profile?.budgets_enabled) { setBudgets([]); return }
      listBudgets().then(({ data, error }) => { if (!error) setBudgets(data ?? []) })
    }, 0)
    return () => clearTimeout(tid)
  }, [profile?.budgets_enabled])

  useEffect(() => {
    listCategories().then(({ data, error }) => {
      if (!error) { setCatMap(new Map((data ?? []).map((c) => [c.id, c]))); cacheSet('categories', data ?? []) }
    })
  }, [])

  useEffect(() => {
    // Deferred (setTimeout) so the seed setState isn't called synchronously in
    // the effect body — same pattern as Stats.
    const tid = setTimeout(() => {
      const cached = cacheGet(monthKey)
      if (cached !== undefined) { setTxns(cached); setLoading(false) } else { setLoading(true) }
      listTransactionsForMonth(year, monthIndex).then(({ data, error }) => {
        if (!error) { setTxns(data ?? []); cacheSet(monthKey, data ?? []) }
        setLoading(false)
      })
    }, 0)
    return () => clearTimeout(tid)
  }, [year, monthIndex, monthKey])

  function reloadTxns() {
    listTransactionsForMonth(year, monthIndex).then(({ data, error }) => {
      if (!error) { setTxns(data ?? []); cacheSet(monthKey, data ?? []) }
    })
  }

  function enterSelect(id) { setSelectMode(true); setSelected(new Set([id])) }
  function exitSelect() { setSelectMode(false); setSelected(new Set()) }
  function toggle(id) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      if (n.size === 0) setSelectMode(false)
      return n
    })
  }
  function activate(t) {
    if (selectMode) toggle(t.id)
    else navigate(`/tx/${t.id}`)
  }
  async function deleteSelected() {
    setDeleting(true)
    await deleteTransactions([...selected])
    setDeleting(false)
    setConfirmBulk(false)
    exitSelect()
    reloadTxns()
  }

  // Apply the persisted account filter (empty filter shows everything).
  const visible = txns.filter((t) => matchesAccountFilter(t, accountIds))

  const days = []
  const byDate = new Map()
  for (const t of visible) {
    if (!byDate.has(t.date)) { byDate.set(t.date, []); days.push(t.date) }
    byDate.get(t.date).push(t)
  }

  const summary = {}
  for (const t of visible) {
    const cur = t.currency
    if (!summary[cur]) summary[cur] = { income: 0, expense: 0 }
    if (t.kind === 'income') summary[cur].income += Number(t.amount)
    else if (t.kind === 'expense') summary[cur].expense += Number(t.amount)
  }
  const summaryCurs = Object.keys(summary)

  // Monthly-budget progress for the Home card, per currency (wallet-wide, so it
  // uses the unfiltered month `txns`, not the account-filtered `visible`).
  const budgetView = useMemo(() => {
    if (!profile?.budgets_enabled) return null
    const monthly = budgets.filter((b) => b.period === 'month')
    if (!monthly.length) return null
    const roll = rollupByParentCurrency(txns)
    const byCur = new Map()
    let over = 0
    for (const b of monthly) {
      const spent = roll.get(`${b.category_id}|${b.currency}`)?.spent ?? 0
      if (!byCur.has(b.currency)) byCur.set(b.currency, { currency: b.currency, budgeted: 0, spent: 0 })
      const s = byCur.get(b.currency)
      s.budgeted += Number(b.amount)
      s.spent += spent
      if (spent > Number(b.amount)) over++
    }
    return { rows: [...byCur.values()], over }
  }, [profile?.budgets_enabled, budgets, txns])

  if (loading) return <p className="text-muted text-sm py-8 text-center">Loading…</p>

  return (
    <div className="flex flex-col desk:grid desk:grid-cols-[1fr_330px] desk:gap-[22px] desk:items-start">
      {/* Mobile: compact summary bar, pinned below the header while scrolling.
          -mt-4 cancels the main's pt-4 so the gap above is the wrapper's own
          padding only — constant whether scrolled or not. */}
      <div className="desk:hidden sticky top-[52px] z-10 bg-bg -mt-4 pt-2.5 pb-2.5 flex flex-col gap-2">
        {(summaryCurs.length === 0 ? [null] : summaryCurs).map((cur) => {
          const s = cur ? summary[cur] : { income: 0, expense: 0 }
          const net = s.income - s.expense
          const fmt = (v) => (cur ? formatMoney(v, cur) : '—')
          return (
            <div key={cur ?? 'none'} className="flex bg-surface border border-border rounded-xl overflow-hidden text-center">
              <CompactCell label="Income" value={fmt(s.income)} color="text-income" />
              <CompactCell label="Expenses" value={fmt(s.expense)} color="text-expense" border />
              <CompactCell label="Net" value={cur ? formatMoney(Math.abs(net), cur) : '—'} color={amountColor(net)} border />
            </div>
          )
        })}
      </div>

      {budgetView && (
        <div className="desk:hidden mb-3.5">
          <BudgetCard view={budgetView} onClick={() => navigate('/budget')} />
        </div>
      )}

      <SwipePager enabled={!selectMode} onPrev={prev} onNext={next} className="min-w-0">
        {days.length === 0 ? (
          <div className="bg-surface border border-border rounded-[14px] p-8 text-center mt-0">
            <p className="text-sm text-muted mb-4">No transactions this month yet.</p>
            <Button onClick={() => navigate('/new')}>
              <PlusIcon className="w-[18px] h-[18px]" /> Add a transaction
            </Button>
          </div>
        ) : (
          days.map((date, di) => {
            const list = byDate.get(date)
            const h = dayHeading(date)
            const inc = {}, exp = {}
            for (const t of list) {
              if (t.kind === 'income') inc[t.currency] = (inc[t.currency] ?? 0) + Number(t.amount)
              else if (t.kind === 'expense') exp[t.currency] = (exp[t.currency] ?? 0) + Number(t.amount)
            }
            return (
              <div key={date} className={`bg-surface border border-border rounded-[14px] overflow-hidden ${di === 0 ? 'mt-0' : 'mt-3.5'}`}>
                <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 bg-surface-2 border-b border-border">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[17px] font-extrabold tracking-[-.3px]">{h.num}</span>
                    <span className="text-xs font-semibold text-muted truncate">{h.rest}</span>
                  </div>
                  <div className="flex gap-3 text-xs font-bold tabular shrink-0">
                    {Object.entries(inc).map(([c, v]) => <span key={'i' + c} className="text-income">{formatMoney(v, c)}</span>)}
                    {Object.entries(exp).map(([c, v]) => <span key={'e' + c} className="text-expense">{formatMoney(v, c)}</span>)}
                  </div>
                </div>
                {list.map((t) => (
                  <TxRow key={t.id} t={t} catMap={catMap} selectMode={selectMode}
                    selected={selected.has(t.id)} onActivate={activate} onLongPress={(tx) => enterSelect(tx.id)} />
                ))}
              </div>
            )
          })
        )}
      </SwipePager>

      {/* Summary rail — desktop only (mobile uses the compact sticky bar above) */}
      <aside className="hidden desk:flex desk:sticky desk:top-[84px] flex-col gap-3.5">
        {summaryCurs.length === 0 ? (
          <SummaryCard label="This month" rows={[['Income', '—', ''], ['Expenses', '—', ''], ['Net', '—', '']]} />
        ) : (
          summaryCurs.map((cur) => {
            const s = summary[cur]
            const net = s.income - s.expense
            return (
              <SummaryCard key={cur} label={summaryCurs.length > 1 ? cur : 'This month'} rows={[
                ['Income', formatMoney(s.income, cur), 'text-income'],
                ['Expenses', formatMoney(s.expense, cur), 'text-expense'],
                ['Net', formatMoney(Math.abs(net), cur), amountColor(net)],
              ]} />
            )
          })
        )}
        {budgetView && <BudgetCard view={budgetView} onClick={() => navigate('/budget')} />}
      </aside>

      {/* Floating selection action bar */}
      {selectMode && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[76px] desk:bottom-6 z-40 bg-surface border border-border rounded-full shadow-lg flex items-center gap-1.5 pl-2 pr-2 py-1.5">
          <button onClick={exitSelect} aria-label="Cancel selection"
            className="w-9 h-9 grid place-items-center rounded-full text-muted hover:bg-surface-2">
            <CloseIcon className="w-[18px] h-[18px]" />
          </button>
          <span className="text-sm font-semibold px-1 tabular">{selected.size} selected</span>
          <button onClick={() => setConfirmBulk(true)} disabled={selected.size === 0}
            className="flex items-center gap-1.5 bg-expense text-white font-bold text-sm rounded-full px-4 py-2 disabled:opacity-50">
            <TrashIcon className="w-4 h-4" /> Delete
          </button>
        </div>
      )}

      {confirmBulk && (
        <ConfirmDialog
          title={`Delete ${selected.size} transaction${selected.size === 1 ? '' : 's'}?`}
          message="They will be permanently removed and balances will update."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={deleteSelected}
          onClose={() => setConfirmBulk(false)}
        />
      )}
    </div>
  )
}

// One cell of the compact mobile summary bar (Income / Expenses / Net).
function CompactCell({ label, value, color, border }) {
  return (
    <div className={`flex-1 py-1.5 px-1 ${border ? 'border-l border-border' : ''}`}>
      <div className="text-[9.5px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      <div className={`text-[12.5px] font-extrabold tabular leading-tight mt-0.5 ${color}`}>{value}</div>
    </div>
  )
}

// Compact monthly-budget card (Home). Per-currency spent-vs-budgeted bars; taps
// through to the full Budget page.
function BudgetCard({ view, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full bg-surface border border-border rounded-[14px] px-4 py-3 text-left hover:bg-surface-2">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-faint">
          <BudgetIcon className="w-4 h-4" /> Budgets · this month
        </span>
        {view.over > 0
          ? <span className="text-[11px] font-bold text-expense">{view.over} over</span>
          : <span className="text-[11px] font-semibold text-muted">on track ›</span>}
      </div>
      {view.rows.map((s) => {
        const st = budgetStatus(s.spent, s.budgeted)
        return (
          <div key={s.currency} className="mt-2 first:mt-0">
            <div className="flex justify-between text-[12px] tabular">
              <span className="text-muted font-semibold">{view.rows.length > 1 ? s.currency : 'Spent'}</span>
              <span className="text-muted">{formatMoney(s.spent, s.currency)} <span className="text-faint">of</span> {formatMoney(s.budgeted, s.currency)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(st.ratio * 100))}%`, background: st.color }} />
            </div>
          </div>
        )
      })}
    </button>
  )
}

function SummaryCard({ label, rows }) {
  return (
    <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
      <div className="px-4 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">{label}</div>
      {rows.map(([k, v, color]) => (
        <div key={k} className="flex justify-between items-baseline px-4 py-2.5 border-t border-border first:border-t-0">
          <span className="text-xs font-semibold text-muted">{k}</span>
          <span className={`text-[15px] font-extrabold tabular ${color || 'text-text'}`}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function TxRow({ t, catMap, selectMode, selected, onActivate, onLongPress }) {
  // Long-press (touch hold or right-click) enters multi-select; a tap activates.
  const timer = useRef(null)
  const longFired = useRef(false)
  const startPress = () => { longFired.current = false; timer.current = setTimeout(() => { longFired.current = true; onLongPress(t) }, 450) }
  const cancelPress = () => clearTimeout(timer.current)
  const handleClick = () => { if (longFired.current) { longFired.current = false; return } onActivate(t) }

  return (
    <div
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(t) }}
      onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={cancelPress}
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
      className={`flex gap-3 px-3.5 py-2.5 border-t border-border first:border-t-0 cursor-pointer select-none ${
        selected ? 'bg-primary-soft' : 'hover:bg-surface-2'
      }`}
    >
      {selectMode && (
        <span className={`mt-0.5 w-5 h-5 rounded-full border grid place-items-center shrink-0 text-[11px] font-bold ${
          selected ? 'bg-primary border-primary text-on-primary' : 'border-border text-transparent'
        }`}>✓</span>
      )}
      <TxRowContent t={t} catMap={catMap} />
    </div>
  )
}
