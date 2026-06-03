// Account detail / ledger (Chunk 7). Tapped from the Accounts page. Shows one
// account's transactions for a selected period, each row with the running
// balance after it (passbook style). Normal accounts page by Day / Month / Year;
// credit cards page by billing cycle (derived from the settlement day).

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
const addDays = (isoStr, n) => { const [y, m, d] = isoStr.split('-').map(Number); return isoOfDate(new Date(y, m - 1, d + n)) }
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const settleIso = (y, m, day) => iso(y, m, Math.min(day, daysInMonth(y, m)))
function shortDate(isoStr) {
  if (!isoStr) return ''
  const [y, m, d] = isoStr.split('-').map(Number)
  return `${d} ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short' })}`
}

// Period date ranges (half-open [start, end)).
const dayRange = (a) => { const s = isoOfDate(a); return { start: s, end: addDays(s, 1), label: dayLabel(s) } }
const yearRange = (a) => { const y = a.getFullYear(); return { start: iso(y, 0, 1), end: iso(y + 1, 0, 1), label: String(y) } }
function monthRange(a) {
  const y = a.getFullYear(), m = a.getMonth()
  return { start: iso(y, m, 1), end: m === 11 ? iso(y + 1, 0, 1) : iso(y, m + 1, 1), label: `${MONTHS[m]} ${y}` }
}
// Credit-card billing cycle ending at the settlement day of month (y, m):
// the day after the previous settlement, through this settlement (inclusive).
function cycleRange(y, m, settleDay) {
  const endSettle = settleIso(y, m, settleDay)
  const pm = m === 0 ? 11 : m - 1, py = m === 0 ? y - 1 : y
  const start = addDays(settleIso(py, pm, settleDay), 1)
  return { start, end: addDays(endSettle, 1), label: `${shortDate(start)} – ${shortDate(endSettle)}` }
}

export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [txns, setTxns] = useState([])
  const [catMap, setCatMap] = useState(new Map())
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState('month') // day | month | year (non-credit)
  const [anchor, setAnchor] = useState(new Date())
  const [cycle, setCycle] = useState(null) // { y, m } for credit cards

  useEffect(() => {
    Promise.all([listAccounts(), listAllTransactionsFull(), listCategories()]).then(([a, t, c]) => {
      const acc = (a.data ?? []).find((x) => x.id === id) ?? null
      setAccount(acc)
      setTxns(t.data ?? [])
      setCatMap(new Map((c.data ?? []).map((x) => [x.id, x])))
      // Seed the billing cycle that contains today for credit cards.
      if (acc?.type === 'credit_card' && acc.settlement_day) {
        const now = new Date()
        let y = now.getFullYear(), m = now.getMonth()
        if (isoOfDate(now) > settleIso(y, m, acc.settlement_day)) { m += 1; if (m > 11) { m = 0; y += 1 } }
        setCycle({ y, m })
      }
      setLoading(false)
    })
  }, [id])

  const isCC = account?.type === 'credit_card' && !!account?.settlement_day
  const currency = account?.currency ?? 'IDR'

  // This account's transactions (either transfer leg), with its signed effect.
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

  // Running balance after each transaction, oldest → newest from opening balance.
  const balAfter = useMemo(() => {
    const asc = [...accountTxns].sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    let run = Number(account?.opening_balance) || 0
    const m = new Map()
    for (const t of asc) { run += delta(t); m.set(t.id, run) }
    return m
  }, [accountTxns, account]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentBalance = useMemo(() => {
    let run = Number(account?.opening_balance) || 0
    for (const t of accountTxns) run += delta(t)
    return run
  }, [accountTxns, account]) // eslint-disable-line react-hooks/exhaustive-deps

  const range = useMemo(() => {
    if (isCC && cycle) return cycleRange(cycle.y, cycle.m, account.settlement_day)
    if (mode === 'day') return dayRange(anchor)
    if (mode === 'year') return yearRange(anchor)
    return monthRange(anchor)
  }, [isCC, cycle, mode, anchor, account])

  function shift(d) {
    if (isCC && cycle) {
      let { y, m } = cycle; m += d
      while (m < 0) { m += 12; y -= 1 }
      while (m > 11) { m -= 12; y += 1 }
      setCycle({ y, m }); return
    }
    setAnchor((a) => {
      const dt = new Date(a)
      if (mode === 'day') dt.setDate(dt.getDate() + d)
      else if (mode === 'year') dt.setFullYear(dt.getFullYear() + d)
      else dt.setMonth(dt.getMonth() + d)
      return dt
    })
  }

  // Transactions in the period, newest first.
  const periodTxns = useMemo(() => {
    return accountTxns
      .filter((t) => t.date >= range.start && t.date < range.end)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }, [accountTxns, range])

  const periodNet = periodTxns.reduce((s, t) => s + delta(t), 0)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 py-2.5 flex items-center gap-2">
          <button onClick={() => navigate('/accounts')} aria-label="Back" className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[15px] truncate">{account?.name ?? 'Account'}</div>
          </div>
          {account && (
            <div className={`font-extrabold text-[15px] tabular shrink-0 ${amountColor(currentBalance)}`}>{formatAbs(currentBalance, currency)}</div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-3.5 desk:px-8 w-full">
          <div className="max-w-[760px] mx-auto">
            {loading ? (
              <p className="text-muted text-sm py-8 text-center">Loading…</p>
            ) : !account ? (
              <p className="text-muted text-sm py-8 text-center">Account not found.</p>
            ) : (
              <>
                {/* Period control */}
                {!isCC && (
                  <div className="mb-2.5">
                    <Segmented value={mode} onChange={setMode} options={[
                      { value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' },
                    ]} />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <button onClick={() => shift(-1)} aria-label="Previous" className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
                    <ChevronLeft className="w-[18px] h-[18px]" />
                  </button>
                  <div className="text-center min-w-0">
                    <div className="font-bold text-[14px] truncate">{range.label}</div>
                    {isCC && <div className="text-[11px] text-faint">Billing cycle</div>}
                  </div>
                  <button onClick={() => shift(1)} aria-label="Next" className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
                    <ChevronRight className="w-[18px] h-[18px]" />
                  </button>
                </div>

                {periodTxns.length === 0 ? (
                  <p className="text-muted text-sm py-10 text-center">No transactions in this period.</p>
                ) : (
                  <>
                    <div className="text-[12px] text-muted text-center mb-2">
                      {periodTxns.length} transaction{periodTxns.length === 1 ? '' : 's'} · net{' '}
                      <span className={amountColor(periodNet)}>{formatAbs(periodNet, currency)}</span>
                    </div>
                    <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
                      {periodTxns.map((t) => (
                        <button key={t.id} onClick={() => navigate(`/tx/${t.id}`)}
                          className="w-full flex items-stretch gap-3 px-3.5 py-3 border-t border-border first:border-t-0 text-left hover:bg-surface-2">
                          <TxRowContent t={t} catMap={catMap} />
                          <div className="text-right shrink-0 self-center pl-1 border-l border-border/60 ml-1">
                            <div className="text-[10px] text-faint uppercase tracking-wide">Balance</div>
                            <div className={`text-[12.5px] font-bold tabular ${amountColor(balAfter.get(t.id) ?? 0)}`}>
                              {formatAbs(balAfter.get(t.id) ?? 0, currency)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <p className="text-[11px] text-faint text-center mt-4 mb-8">Tap a transaction to edit it.</p>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
