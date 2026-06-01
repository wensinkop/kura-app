import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMonth } from '../MonthContext'
import { listTransactionsForMonth, listCategories } from '../lib/data'
import { formatMoney } from '../lib/format'
import { Button } from '../components/ui'
import { PlusIcon } from '../lib/icons'

const KIND_COLOR = { income: 'text-income', expense: 'text-expense', transfer: 'text-transfer' }
const KIND_SIGN = { income: '+', expense: '−', transfer: '' }

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

// chip = top-level category; sub = sub-category name (only when the tx points at
// a sub). Null category -> "Uncategorised". Parent name comes from catMap since
// the row only carries the category's own id/name/parent_id.
function catLabels(tx, catMap) {
  const c = tx.category
  if (!c) return { chip: 'Uncategorised', sub: null }
  if (c.parent_id) return { chip: catMap.get(c.parent_id)?.name ?? '…', sub: c.name }
  return { chip: c.name, sub: null }
}

export default function Home() {
  const { year, monthIndex } = useMonth()
  const navigate = useNavigate()
  const [txns, setTxns] = useState([])
  const [catMap, setCatMap] = useState(new Map())
  const [loading, setLoading] = useState(true)

  // Categories rarely change; load once for parent-name resolution.
  useEffect(() => {
    listCategories().then(({ data, error }) => {
      if (!error) setCatMap(new Map((data ?? []).map((c) => [c.id, c])))
    })
  }, [])

  // Refetch whenever the selected month changes. setState only inside the async
  // callback (keeps react-hooks/set-state-in-effect happy); the existing list
  // stays visible until the new month's data arrives.
  useEffect(() => {
    listTransactionsForMonth(year, monthIndex).then(({ data, error }) => {
      if (!error) setTxns(data ?? [])
      setLoading(false)
    })
  }, [year, monthIndex])

  // Group into day-cards (already date-desc from the query).
  const days = []
  const byDate = new Map()
  for (const t of txns) {
    if (!byDate.has(t.date)) { byDate.set(t.date, []); days.push(t.date) }
    byDate.get(t.date).push(t)
  }

  // Month summary per currency: { [cur]: { income, expense } }.
  const summary = {}
  for (const t of txns) {
    const cur = t.currency
    if (!summary[cur]) summary[cur] = { income: 0, expense: 0 }
    if (t.kind === 'income') summary[cur].income += Number(t.amount)
    else if (t.kind === 'expense') summary[cur].expense += Number(t.amount)
  }
  const summaryCurs = Object.keys(summary)

  if (loading) return <p className="text-muted text-sm py-8 text-center">Loading…</p>

  return (
    <div className="flex flex-col desk:grid desk:grid-cols-[1fr_330px] desk:gap-[22px] desk:items-start">
      <div className="min-w-0">
        {days.length === 0 ? (
          <div className="bg-surface border border-border rounded-[14px] p-8 text-center mt-3.5 desk:mt-0">
            <p className="text-sm text-muted mb-4">No transactions this month yet.</p>
            <Button onClick={() => navigate('/new')}>
              <PlusIcon className="w-[18px] h-[18px]" /> Add a transaction
            </Button>
          </div>
        ) : (
          days.map((date, di) => {
            const list = byDate.get(date)
            const h = dayHeading(date)
            // Per-currency day totals.
            const inc = {}, exp = {}
            for (const t of list) {
              if (t.kind === 'income') inc[t.currency] = (inc[t.currency] ?? 0) + Number(t.amount)
              else if (t.kind === 'expense') exp[t.currency] = (exp[t.currency] ?? 0) + Number(t.amount)
            }
            return (
              <div key={date} className={`bg-surface border border-border rounded-[14px] overflow-hidden mt-3.5 ${di === 0 ? 'desk:mt-0' : ''}`}>
                <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 bg-surface-2 border-b border-border">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[17px] font-extrabold tracking-[-.3px]">{h.num}</span>
                    <span className="text-xs font-semibold text-muted truncate">{h.rest}</span>
                  </div>
                  <div className="flex gap-3 text-xs font-bold tabular shrink-0">
                    {Object.entries(inc).map(([c, v]) => <span key={'i' + c} className="text-income">+{formatMoney(v, c)}</span>)}
                    {Object.entries(exp).map(([c, v]) => <span key={'e' + c} className="text-expense">−{formatMoney(v, c)}</span>)}
                  </div>
                </div>
                {list.map((t) => <TxRow key={t.id} t={t} catMap={catMap} />)}
              </div>
            )
          })
        )}
      </div>

      {/* Summary rail — on top on mobile (order-first), 330px right column on desktop */}
      <aside className="order-first desk:order-none desk:sticky desk:top-[84px] flex flex-col gap-3.5">
        {summaryCurs.length === 0 ? (
          <SummaryCard label="This month" rows={[['Income', '—', ''], ['Expenses', '—', ''], ['Net', '—', '']]} />
        ) : (
          summaryCurs.map((cur) => {
            const s = summary[cur]
            const net = s.income - s.expense
            return (
              <SummaryCard key={cur} label={summaryCurs.length > 1 ? cur : 'This month'} rows={[
                ['Income', '+' + formatMoney(s.income, cur), 'text-income'],
                ['Expenses', '−' + formatMoney(s.expense, cur), 'text-expense'],
                ['Net', (net >= 0 ? '+' : '−') + formatMoney(Math.abs(net), cur), net >= 0 ? 'text-income' : 'text-expense'],
              ]} />
            )
          })
        )}
      </aside>
    </div>
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

function TxRow({ t, catMap }) {
  const { chip, sub } = catLabels(t, catMap)
  return (
    <div className="px-3.5 py-2.5 border-t border-border first:border-t-0">
      <div className="flex justify-between gap-3 items-baseline">
        <span className="font-semibold text-[14.5px] leading-tight truncate min-w-0">{t.note || chip}</span>
        <span className={`font-bold text-[14.5px] tabular whitespace-nowrap ${KIND_COLOR[t.kind]}`}>
          {KIND_SIGN[t.kind]}{formatMoney(t.amount, t.currency)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-surface-2 text-muted border border-border whitespace-nowrap">{chip}</span>
        {sub && <span className="text-xs text-muted truncate">{sub}</span>}
        <span className="text-xs text-faint ml-auto whitespace-nowrap shrink-0">{t.account?.name}</span>
      </div>
    </div>
  )
}
