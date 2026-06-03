// Account detail / ledger (Chunk 7). Tapped from the Accounts page. The view
// sets the zoom level and is scoped one period coarser, navigable with ‹ ›:
//   • Daily   — one month at a time; transactions grouped by day, each with the
//               running balance. Prev/next = month.
//   • Monthly — one year at a time; a summary row per month. Prev/next = year.
//   • Yearly  — all years; a summary row per year.
// Credit cards are scoped to a billing cycle (from the settlement day); prev/next
// pages through cycles.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listAccounts, listAllTransactionsFull, listCategories } from '../lib/data'
import { formatAbs, amountColor, dayLabel } from '../lib/format'
import { Segmented } from '../components/ui'
import TxRowContent from '../components/TxRowContent'
import Sidebar from '../components/Sidebar'
import { ChevronLeft, ChevronRight } from '../lib/icons'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const isoOfDate = (dt) => iso(dt.getFullYear(), dt.getMonth(), dt.getDate())
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return isoOfDate(new Date(y, m - 1, d + n)) }
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const settleIso = (y, m, day) => iso(y, m, Math.min(day, daysInMonth(y, m)))
function shortDate(s) { const [, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1]}` }

// Billing-cycle helpers (cycle ends on the settlement day).
function cycleEndFor(dateIso, settleDay) {
  const [y, m] = dateIso.split('-').map(Number) // m 1-based
  const thisEnd = settleIso(y, m - 1, settleDay)
  if (dateIso <= thisEnd) return thisEnd
  let mm = m, yy = y // current 1-based value = next month 0-based index
  if (mm > 11) { mm = 0; yy += 1 }
  return settleIso(yy, mm, settleDay)
}
function cycleStartFromEnd(endIso, settleDay) {
  const [y, m] = endIso.split('-').map(Number)
  let pm = m - 2, py = y
  if (pm < 0) { pm = 11; py -= 1 }
  return addDays(settleIso(py, pm, settleDay), 1)
}
function shiftCycleEnd(endIso, delta, settleDay) {
  const [y, m] = endIso.split('-').map(Number)
  let mm = (m - 1) + delta, yy = y
  while (mm < 0) { mm += 12; yy -= 1 }
  while (mm > 11) { mm -= 12; yy += 1 }
  return settleIso(yy, mm, settleDay)
}

export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [txns, setTxns] = useState([])
  const [catMap, setCatMap] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('day') // day | month | year (non-credit)
  const [anchor, setAnchor] = useState(new Date())
  const [cycleEnd, setCycleEnd] = useState(null) // ISO end-settlement for credit cards

  useEffect(() => {
    Promise.all([listAccounts(), listAllTransactionsFull(), listCategories()]).then(([a, t, c]) => {
      const acc = (a.data ?? []).find((x) => x.id === id) ?? null
      setAccount(acc)
      setTxns(t.data ?? [])
      setCatMap(new Map((c.data ?? []).map((x) => [x.id, x])))
      if (acc?.type === 'credit_card' && acc.settlement_day) setCycleEnd(cycleEndFor(isoOfDate(new Date()), acc.settlement_day))
      setLoading(false)
    })
  }, [id])

  const isCC = account?.type === 'credit_card' && !!account?.settlement_day
  const currency = account?.currency ?? 'IDR'

  const delta = (t) => {
    const amt = Number(t.amount) || 0
    if (t.account_id === id) {
      if (t.kind === 'income') return amt
      if (t.kind === 'expense') return -amt
      if (t.kind === 'transfer') return -amt
    }
    if (t.to_account_id === id && t.kind === 'transfer') return Number(t.to_amount) || amt
    return 0
  }
  const accountTxns = useMemo(() => txns.filter((t) => t.account_id === id || t.to_account_id === id), [txns, id])

  // Oldest → newest with the running balance after each (from opening balance).
  const ascWithBalance = useMemo(() => {
    const asc = [...accountTxns].sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    let run = Number(account?.opening_balance) || 0
    const out = []
    for (const t of asc) { run += delta(t); out.push({ t, balance: run }) }
    return out
  }, [accountTxns, account]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentBalance = ascWithBalance.length ? ascWithBalance[ascWithBalance.length - 1].balance : (Number(account?.opening_balance) || 0)

  // Scope (the navigable period) + its label. Yearly has no scope (all years).
  const scope = useMemo(() => {
    if (isCC && cycleEnd) {
      const start = cycleStartFromEnd(cycleEnd, account.settlement_day)
      return { start, end: addDays(cycleEnd, 1), label: `${shortDate(start)} – ${shortDate(cycleEnd)}`, sub: 'Billing cycle' }
    }
    const y = anchor.getFullYear(), m = anchor.getMonth()
    if (mode === 'day') return { start: iso(y, m, 1), end: m === 11 ? iso(y + 1, 0, 1) : iso(y, m + 1, 1), label: `${MONTHS[m]} ${y}` }
    if (mode === 'month') return { start: iso(y, 0, 1), end: iso(y + 1, 0, 1), label: String(y) }
    return { start: null, end: null, label: 'All years' } // yearly
  }, [isCC, cycleEnd, mode, anchor, account])

  const canNavigate = isCC || mode !== 'year'
  function shift(d) {
    if (isCC && cycleEnd) { setCycleEnd((e) => shiftCycleEnd(e, d, account.settlement_day)); return }
    setAnchor((a) => {
      const dt = new Date(a)
      if (mode === 'day') dt.setMonth(dt.getMonth() + d)
      else if (mode === 'month') dt.setFullYear(dt.getFullYear() + d)
      return dt
    })
  }

  // Transactions in scope, then grouped. Detailed (daily / credit-card cycle):
  // grouped by day, each row shown. Monthly/yearly: one summary row per group.
  const detailed = isCC || mode === 'day'
  const inScope = useMemo(
    () => ascWithBalance.filter((e) => !scope.start || (e.t.date >= scope.start && e.t.date < scope.end)),
    [ascWithBalance, scope]
  )
  const groups = useMemo(() => {
    const keyFn = (isCC || mode === 'day') ? (e) => e.t.date
      : mode === 'month' ? (e) => e.t.date.slice(0, 7)
        : (e) => e.t.date.slice(0, 4)
    const map = new Map()
    for (const e of inScope) { const k = keyFn(e); if (!map.has(k)) map.set(k, []); map.get(k).push(e) }
    const out = []
    for (const [key, rowsAsc] of map) {
      out.push({ key, rows: [...rowsAsc].reverse(), net: rowsAsc.reduce((s, e) => s + delta(e.t), 0), endBalance: rowsAsc[rowsAsc.length - 1].balance })
    }
    out.sort((a, b) => b.key.localeCompare(a.key))
    return out
  }, [inScope, mode, isCC]) // eslint-disable-line react-hooks/exhaustive-deps

  const groupLabel = (key) => {
    if (isCC || mode === 'day') return dayLabel(key)
    if (mode === 'month') { const [y, m] = key.split('-'); return `${MONTHS[Number(m) - 1]} ${y}` }
    return key
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 py-2.5 flex items-center gap-2">
          <button onClick={() => navigate('/accounts')} aria-label="Back" className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="min-w-0 flex-1"><div className="font-bold text-[15px] truncate">{account?.name ?? 'Account'}</div></div>
          {account && <div className={`font-extrabold text-[15px] tabular shrink-0 ${amountColor(currentBalance)}`}>{formatAbs(currentBalance, currency)}</div>}
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-3.5 desk:px-8 w-full">
          <div className="max-w-[760px] mx-auto">
            {loading ? (
              <p className="text-muted text-sm py-8 text-center">Loading…</p>
            ) : !account ? (
              <p className="text-muted text-sm py-8 text-center">Account not found.</p>
            ) : (
              <>
                {!isCC && (
                  <div className="mb-2.5">
                    <Segmented value={mode} onChange={setMode} options={[
                      { value: 'day', label: 'Daily' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' },
                    ]} />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <button onClick={() => shift(-1)} aria-label="Previous" disabled={!canNavigate}
                    className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2 disabled:opacity-0">
                    <ChevronLeft className="w-[18px] h-[18px]" />
                  </button>
                  <div className="text-center min-w-0">
                    <div className="font-bold text-[14px] truncate">{scope.label}</div>
                    {scope.sub && <div className="text-[11px] text-faint">{scope.sub}</div>}
                  </div>
                  <button onClick={() => shift(1)} aria-label="Next" disabled={!canNavigate}
                    className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2 disabled:opacity-0">
                    <ChevronRight className="w-[18px] h-[18px]" />
                  </button>
                </div>

                {groups.length === 0 ? (
                  <p className="text-muted text-sm py-10 text-center">No transactions in this period.</p>
                ) : detailed ? (
                  groups.map((g) => (
                    <div key={g.key} className="mb-4">
                      <div className="text-[12px] font-bold text-muted px-1 mb-1.5">{groupLabel(g.key)}</div>
                      <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
                        {g.rows.map(({ t, balance }) => (
                          <button key={t.id} onClick={() => navigate(`/tx/${t.id}`)}
                            className="w-full px-3.5 py-3 border-t border-border first:border-t-0 text-left hover:bg-surface-2">
                            <div className="flex"><TxRowContent t={t} catMap={catMap} /></div>
                            <div className="text-[11px] text-faint text-right mt-1 tabular">
                              Balance <span className={`font-semibold ${amountColor(balance)}`}>{formatAbs(balance, currency)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
                    {groups.map((g) => (
                      <div key={g.key} className="flex items-center gap-3 px-3.5 py-3 border-t border-border first:border-t-0">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14.5px]">{groupLabel(g.key)}</div>
                          <div className="text-[12px] text-muted mt-0.5">
                            {g.rows.length} transaction{g.rows.length === 1 ? '' : 's'} · net <span className={amountColor(g.net)}>{formatAbs(g.net, currency)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-faint uppercase tracking-wide">End balance</div>
                          <div className={`text-[13.5px] font-bold tabular ${amountColor(g.endBalance)}`}>{formatAbs(g.endBalance, currency)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {detailed && groups.length > 0 && <p className="text-[11px] text-faint text-center mt-2 mb-8">Tap a transaction to edit it.</p>}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
