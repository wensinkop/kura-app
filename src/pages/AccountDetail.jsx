// Account detail / ledger (Chunk 7). Tapped from the Accounts page. Shows one
// account's whole history at a chosen zoom level:
//   • Daily  — every transaction, grouped by day, each with the running balance.
//   • Monthly — one summary row per month (net + end-of-month balance).
//   • Yearly  — one summary row per year.
// Credit cards are grouped by billing cycle (from the settlement day) instead.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listAccounts, listAllTransactionsFull, listCategories } from '../lib/data'
import { formatAbs, amountColor, dayLabel } from '../lib/format'
import { Segmented } from '../components/ui'
import TxRowContent from '../components/TxRowContent'
import Sidebar from '../components/Sidebar'
import { ChevronLeft } from '../lib/icons'

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

// The billing cycle a date falls in = ends at the first settlement on/after it.
function cycleEndFor(dateIso, settleDay) {
  const [y, m] = dateIso.split('-').map(Number) // m is 1-based
  const thisEnd = settleIso(y, m - 1, settleDay)
  if (dateIso <= thisEnd) return thisEnd
  let mm = m, yy = y // next month, 0-based index = current 1-based value
  if (mm > 11) { mm = 0; yy += 1 }
  return settleIso(yy, mm, settleDay)
}
function cycleLabelFor(endIso, settleDay) {
  const [y, m] = endIso.split('-').map(Number) // m is 1-based
  let pm = m - 2, py = y // previous month, 0-based
  if (pm < 0) { pm = 11; py -= 1 }
  const start = addDays(settleIso(py, pm, settleDay), 1)
  return `${shortDate(start)} – ${shortDate(endIso)}`
}

export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [txns, setTxns] = useState([])
  const [catMap, setCatMap] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('day') // day | month | year (non-credit)

  useEffect(() => {
    Promise.all([listAccounts(), listAllTransactionsFull(), listCategories()]).then(([a, t, c]) => {
      setAccount((a.data ?? []).find((x) => x.id === id) ?? null)
      setTxns(t.data ?? [])
      setCatMap(new Map((c.data ?? []).map((x) => [x.id, x])))
      setLoading(false)
    })
  }, [id])

  const isCC = account?.type === 'credit_card' && !!account?.settlement_day
  const currency = account?.currency ?? 'IDR'

  // Signed effect of a transaction on THIS account (handles both transfer legs).
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

  // Oldest → newest, with the running balance after each (from opening balance).
  const ascWithBalance = useMemo(() => {
    const asc = [...accountTxns].sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    let run = Number(account?.opening_balance) || 0
    const out = []
    for (const t of asc) { run += delta(t); out.push({ t, balance: run }) }
    return out
  }, [accountTxns, account]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentBalance = ascWithBalance.length ? ascWithBalance[ascWithBalance.length - 1].balance : (Number(account?.opening_balance) || 0)

  // Group into periods (newest first). Each: { key, label, rows:[{t,balance}] desc,
  // net, endBalance }. Daily & credit-card cycles are shown in detail; month/year
  // collapse to one summary row each.
  const detailed = isCC || mode === 'day'
  const groups = useMemo(() => {
    const keyFn = isCC
      ? (e) => cycleEndFor(e.t.date, account.settlement_day)
      : mode === 'year' ? (e) => e.t.date.slice(0, 4)
        : mode === 'month' ? (e) => e.t.date.slice(0, 7)
          : (e) => e.t.date
    const map = new Map()
    for (const e of ascWithBalance) { // ascWithBalance is oldest→newest
      const k = keyFn(e)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(e)
    }
    const out = []
    for (const [key, rowsAsc] of map) {
      out.push({
        key,
        rows: [...rowsAsc].reverse(), // newest first for display
        net: rowsAsc.reduce((s, e) => s + delta(e.t), 0),
        endBalance: rowsAsc[rowsAsc.length - 1].balance,
      })
    }
    out.sort((a, b) => b.key.localeCompare(a.key))
    return out
  }, [ascWithBalance, mode, isCC, account]) // eslint-disable-line react-hooks/exhaustive-deps

  function groupLabel(key) {
    if (isCC) return cycleLabelFor(key, account.settlement_day)
    if (mode === 'year') return key
    if (mode === 'month') { const [y, m] = key.split('-'); return `${MONTHS[Number(m) - 1]} ${y}` }
    return dayLabel(key)
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
                {isCC ? (
                  <div className="text-[12px] text-muted text-center mb-3">Grouped by billing cycle</div>
                ) : (
                  <div className="mb-3">
                    <Segmented value={mode} onChange={setMode} options={[
                      { value: 'day', label: 'Daily' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' },
                    ]} />
                  </div>
                )}

                {groups.length === 0 ? (
                  <p className="text-muted text-sm py-10 text-center">No transactions yet.</p>
                ) : detailed ? (
                  groups.map((g) => (
                    <div key={g.key} className="mb-4">
                      <div className="flex items-baseline justify-between gap-2 px-1 mb-1.5">
                        <span className="text-[12px] font-bold text-muted">{groupLabel(g.key)}</span>
                        {isCC && <span className="text-[11px] text-faint">balance {formatAbs(g.endBalance, currency)}</span>}
                      </div>
                      <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
                        {g.rows.map(({ t, balance }) => (
                          <button key={t.id} onClick={() => navigate(`/tx/${t.id}`)}
                            className="w-full flex items-stretch gap-3 px-3.5 py-3 border-t border-border first:border-t-0 text-left hover:bg-surface-2">
                            <TxRowContent t={t} catMap={catMap} />
                            <div className="text-right shrink-0 self-center pl-2 border-l border-border/60 ml-1">
                              <div className="text-[10px] text-faint uppercase tracking-wide">Balance</div>
                              <div className={`text-[12.5px] font-bold tabular ${amountColor(balance)}`}>{formatAbs(balance, currency)}</div>
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
