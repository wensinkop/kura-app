// Account detail / ledger (Chunk 7). Tapped from the Accounts page. The view
// sets the zoom level and is scoped one period coarser, navigable with ‹ ›:
//   • Daily   — one month at a time; transactions grouped by day, each with the
//               running balance. Prev/next = month.
//   • Monthly — one year at a time; a summary row per month. Prev/next = year.
//   • Yearly  — all years; a summary row per year.
// Credit cards are scoped to a billing cycle (from the settlement day); prev/next
// pages through cycles.
//
// View state (mode + period) is mirrored to the URL so that opening a transaction
// and coming back (edit/delete → navigate(-1)) restores the same spot instead of
// snapping to today. The detailed (daily / credit-card) view also supports
// long-press multi-select + bulk delete, mirroring Home.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { listAccounts, listAccountTransactionsFull, listCategories, deleteTransactions } from '../lib/data'
import { cacheGet, cacheSet } from '../lib/cache'
import { formatMoney, formatSigned, amountColor, dayLabel, monthYearLabel } from '../lib/format'
import { Segmented, ConfirmDialog } from '../components/ui'
import TxRowContent from '../components/TxRowContent'
import Sidebar from '../components/Sidebar'
import i18n from '../i18n'
import { ChevronLeft, ChevronRight, TrashIcon, CloseIcon } from '../lib/icons'
import SwipePager from '../components/SwipePager'

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const isoOfDate = (dt) => iso(dt.getFullYear(), dt.getMonth(), dt.getDate())
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return isoOfDate(new Date(y, m - 1, d + n)) }
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const settleIso = (y, m, day) => iso(y, m, Math.min(day, daysInMonth(y, m)))
// "5 Jul" with the month name in the UI language.
function shortDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return `${d} ${new Date(y, m - 1, d).toLocaleDateString(i18n.language || 'en', { month: 'short' })}`
}

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
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  // Seed from the session cache so opening an account is instant. The ledger now
  // fetches only THIS account's transactions (keyed per account), not the whole
  // history.
  const txKey = `accFull:${id}`
  const seedAcc = (cacheGet('accounts') ?? []).find((x) => x.id === id) ?? null
  const [account, setAccount] = useState(seedAcc)
  const [txns, setTxns] = useState(() => cacheGet(txKey) ?? [])
  const [catMap, setCatMap] = useState(() => new Map((cacheGet('categories') ?? []).map((x) => [x.id, x])))
  const [loading, setLoading] = useState(() => !(cacheGet('accounts') !== undefined && cacheGet(txKey) !== undefined && cacheGet('categories') !== undefined))

  // View state is seeded from the URL so it survives a round-trip to a
  // transaction screen (bug: it used to reset to the current month on back).
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState(() => {
    const v = searchParams.get('view')
    return v === 'month' || v === 'year' ? v : 'day'
  }) // day | month | year (non-credit)
  const [anchor, setAnchor] = useState(() => {
    const m = searchParams.get('m')
    if (m && /^\d{4}-\d{2}$/.test(m)) { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1) }
    return new Date()
  })
  const [cycleEnd, setCycleEnd] = useState(() => {
    const c = searchParams.get('cycle')
    if (c && /^\d{4}-\d{2}-\d{2}$/.test(c)) return c
    return (seedAcc?.type === 'credit_card' && seedAcc.settlement_day) ? cycleEndFor(isoOfDate(new Date()), seedAcc.settlement_day) : null
  })

  // Multi-select (long-press) → bulk delete, mirroring Home.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    Promise.all([listAccounts(), listAccountTransactionsFull(id), listCategories()]).then(([a, t, c]) => {
      const acc = (a.data ?? []).find((x) => x.id === id) ?? null
      setAccount(acc)
      if (!a.error) cacheSet('accounts', a.data ?? [])
      if (!t.error) { setTxns(t.data ?? []); cacheSet(txKey, t.data ?? []) }
      if (!c.error) { setCatMap(new Map((c.data ?? []).map((x) => [x.id, x]))); cacheSet('categories', c.data ?? []) }
      // Don't clobber a cycle restored from the URL.
      if (acc?.type === 'credit_card' && acc.settlement_day) setCycleEnd((prev) => prev ?? cycleEndFor(isoOfDate(new Date()), acc.settlement_day))
      setLoading(false)
    })
  }, [id, txKey])

  const isCC = account?.type === 'credit_card' && !!account?.settlement_day
  const currency = account?.currency ?? 'IDR'

  // Mirror the view state into the URL (replace, so paging doesn't pile up
  // history). On return from a transaction, navigate(-1) restores this URL and
  // the useState seeders above pick the period back up.
  useEffect(() => {
    const sp = new URLSearchParams()
    if (mode !== 'day') sp.set('view', mode)
    if (isCC) { if (cycleEnd) sp.set('cycle', cycleEnd) }
    else if (mode !== 'year') sp.set('m', `${anchor.getFullYear()}-${pad(anchor.getMonth() + 1)}`)
    setSearchParams(sp, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, anchor, cycleEnd, isCC])

  function refetch() {
    Promise.all([listAccounts(), listAccountTransactionsFull(id), listCategories()]).then(([a, tt, c]) => {
      const acc = (a.data ?? []).find((x) => x.id === id) ?? null
      if (acc) setAccount(acc)
      if (!a.error) cacheSet('accounts', a.data ?? [])
      if (!tt.error) { setTxns(tt.data ?? []); cacheSet(txKey, tt.data ?? []) }
      if (!c.error) { setCatMap(new Map((c.data ?? []).map((x) => [x.id, x]))); cacheSet('categories', c.data ?? []) }
    })
  }

  function enterSelect(rowId) { setSelectMode(true); setSelected(new Set([rowId])) }
  function exitSelect() { setSelectMode(false); setSelected(new Set()) }
  function toggle(rowId) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(rowId)) n.delete(rowId); else n.add(rowId)
      if (n.size === 0) setSelectMode(false)
      return n
    })
  }
  function activate(tx) { if (selectMode) toggle(tx.id); else navigate(`/tx/${tx.id}`) }
  async function deleteSelected() {
    setDeleting(true)
    await deleteTransactions([...selected])
    setDeleting(false)
    setConfirmBulk(false)
    exitSelect()
    refetch()
  }

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
      return { start, end: addDays(cycleEnd, 1), label: `${shortDate(start)} – ${shortDate(cycleEnd)}`, sub: t('accountDetail.billingCycle') }
    }
    const y = anchor.getFullYear(), m = anchor.getMonth()
    if (mode === 'day') return { start: iso(y, m, 1), end: m === 11 ? iso(y + 1, 0, 1) : iso(y, m + 1, 1), label: monthYearLabel(y, m) }
    if (mode === 'month') return { start: iso(y, 0, 1), end: iso(y + 1, 0, 1), label: String(y) }
    return { start: null, end: null, label: t('accountDetail.allYears') } // yearly
  }, [isCC, cycleEnd, mode, anchor, account, t])

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

  // Is the view already showing the period that contains today? (Used to offer a
  // "jump back to today" shortcut after the user pages away.)
  const now = new Date()
  const atCurrent = isCC
    ? cycleEnd === cycleEndFor(isoOfDate(now), account?.settlement_day)
    : mode === 'day' ? (anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth())
      : mode === 'month' ? anchor.getFullYear() === now.getFullYear()
        : true // yearly already spans all years
  function goCurrent() {
    if (isCC) { setCycleEnd(cycleEndFor(isoOfDate(new Date()), account.settlement_day)); return }
    setAnchor(new Date())
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
    if (mode === 'month') { const [y, m] = key.split('-'); return monthYearLabel(Number(y), Number(m) - 1) }
    return key
  }

  // Per-period totals shown above the ledger (every account, every period):
  // money in (income + transfers in), money out (expenses + transfers out), and
  // the running balance at the end of the period.
  const periodIn = inScope.reduce((s, e) => { const d = delta(e.t); return d > 0 ? s + d : s }, 0)
  const periodOut = inScope.reduce((s, e) => { const d = delta(e.t); return d < 0 ? s - d : s }, 0)
  const periodEndBalance = (() => {
    if (!scope.end) return currentBalance // "all years" has no upper bound
    let bal = Number(account?.opening_balance) || 0
    for (const e of ascWithBalance) { if (e.t.date < scope.end) bal = e.balance; else break }
    return bal
  })()

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 pt-[calc(0.625rem_+_env(safe-area-inset-top))] pb-2.5 flex items-center gap-2">
          <button onClick={() => navigate('/accounts')} aria-label={t('common.back')} className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="min-w-0 flex-1"><div className="font-bold text-[15px] truncate">{account?.name ?? t('nav.accounts')}</div></div>
          {account && <div className={`font-extrabold text-[15px] tabular shrink-0 ${amountColor(currentBalance)}`}>{formatSigned(currentBalance, currency)}</div>}
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-clip px-4 py-3.5 desk:px-8 w-full">
          <div className="max-w-[760px] mx-auto">
            {loading ? (
              <p className="text-muted text-sm py-8 text-center">{t('common.loading')}</p>
            ) : !account ? (
              <p className="text-muted text-sm py-8 text-center">{t('accountDetail.notFound')}</p>
            ) : (
              <>
                {!isCC && (
                  <div className="mb-2.5">
                    <Segmented value={mode} onChange={(m) => { setMode(m); exitSelect() }} options={[
                      { value: 'day', label: t('accountDetail.daily') }, { value: 'month', label: t('accountDetail.monthly') }, { value: 'year', label: t('accountDetail.yearly') },
                    ]} />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <button onClick={() => shift(-1)} aria-label={t('month.previous')} disabled={!canNavigate}
                    className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent">
                    <ChevronLeft className="w-[18px] h-[18px]" />
                  </button>
                  <div className="text-center min-w-0">
                    <div className="font-bold text-[14px] truncate">{scope.label}</div>
                    {scope.sub && <div className="text-[11px] text-faint">{scope.sub}</div>}
                    {canNavigate && !atCurrent && (
                      <button onClick={goCurrent} className="text-[11px] font-semibold text-primary hover:underline mt-0.5">
                        {t('accountDetail.jumpToday')}
                      </button>
                    )}
                  </div>
                  <button onClick={() => shift(1)} aria-label={t('month.next')} disabled={!canNavigate}
                    className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent">
                    <ChevronRight className="w-[18px] h-[18px]" />
                  </button>
                </div>

                <SwipePager enabled={canNavigate && !selectMode} onPrev={() => shift(-1)} onNext={() => shift(1)}>
                {/* Per-period summary: income in, expenses out, ending balance.
                    (The header shows the current balance across all time.) */}
                <div className="bg-surface border border-border rounded-[14px] mb-3 flex overflow-hidden text-center">
                  <div className="flex-1 py-2.5 px-2 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{t('home.income')}</div>
                    <div className="text-[12.5px] font-extrabold tabular text-income leading-tight mt-0.5 truncate">{formatMoney(periodIn, currency)}</div>
                  </div>
                  <div className="flex-1 py-2.5 px-2 min-w-0 border-l border-border">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{t('home.expenses')}</div>
                    <div className="text-[12.5px] font-extrabold tabular text-expense leading-tight mt-0.5 truncate">{formatMoney(periodOut, currency)}</div>
                  </div>
                  <div className="flex-1 py-2.5 px-2 min-w-0 border-l border-border">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{t('accountDetail.endBalance')}</div>
                    <div className={`text-[12.5px] font-extrabold tabular leading-tight mt-0.5 truncate ${amountColor(periodEndBalance)}`}>{formatSigned(periodEndBalance, currency)}</div>
                  </div>
                </div>

                {groups.length === 0 ? (
                  <p className="text-muted text-sm py-10 text-center">{t('accountDetail.noneInPeriod')}</p>
                ) : detailed ? (
                  groups.map((g) => (
                    <div key={g.key} className="mb-4">
                      <div className="text-[12px] font-bold text-muted px-1 mb-1.5">{groupLabel(g.key)}</div>
                      <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
                        {g.rows.map(({ t: tx, balance }) => (
                          <LedgerRow key={tx.id} tx={tx} balance={balance} currency={currency} catMap={catMap}
                            selectMode={selectMode} selected={selected.has(tx.id)}
                            onActivate={activate} onLongPress={(x) => enterSelect(x.id)} />
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
                            {t('accountDetail.txnsNet', { count: g.rows.length, net: formatSigned(g.net, currency) })}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-faint uppercase tracking-wide">{t('accountDetail.endBalance')}</div>
                          <div className="text-[13.5px] font-bold tabular text-text">{formatSigned(g.endBalance, currency)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {detailed && groups.length > 0 && <p className="text-[11px] text-faint text-center mt-2 mb-8">{t('accountDetail.tapToEdit')}</p>}
                </SwipePager>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Floating selection action bar (mirrors Home) */}
      {selectMode && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[76px] desk:bottom-6 z-40 bg-surface border border-border rounded-full shadow-lg flex items-center gap-1.5 pl-2 pr-2 py-1.5">
          <button onClick={exitSelect} aria-label={t('home.cancelSelection')}
            className="w-9 h-9 grid place-items-center rounded-full text-muted hover:bg-surface-2">
            <CloseIcon className="w-[18px] h-[18px]" />
          </button>
          <span className="text-sm font-semibold px-1 tabular">{t('home.selected', { count: selected.size })}</span>
          <button onClick={() => setConfirmBulk(true)} disabled={selected.size === 0}
            className="flex items-center gap-1.5 bg-expense text-white font-bold text-sm rounded-full px-4 py-2 disabled:opacity-50">
            <TrashIcon className="w-4 h-4" /> {t('home.delete')}
          </button>
        </div>
      )}

      {confirmBulk && (
        <ConfirmDialog
          title={t('home.deleteTitle', { count: selected.size })}
          message={t('home.deleteMessage')}
          confirmLabel={t('home.delete')}
          busy={deleting}
          onConfirm={deleteSelected}
          onClose={() => setConfirmBulk(false)}
        />
      )}
    </div>
  )
}

// One ledger row (daily / credit-card view): tap opens the transaction; long-press
// (touch hold or right-click) enters multi-select, mirroring Home's TxRow. Uses
// `tx` (not `t`) for the transaction so it never shadows the translator.
function LedgerRow({ tx, balance, currency, catMap, selectMode, selected, onActivate, onLongPress }) {
  const { t } = useTranslation()
  const timer = useRef(null)
  const longFired = useRef(false)
  const startPress = () => { longFired.current = false; timer.current = setTimeout(() => { longFired.current = true; onLongPress(tx) }, 450) }
  const cancelPress = () => clearTimeout(timer.current)
  const handleClick = () => { if (longFired.current) { longFired.current = false; return } onActivate(tx) }

  return (
    <div
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(tx) }}
      onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={cancelPress}
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
      role={selectMode ? 'checkbox' : undefined}
      aria-checked={selectMode ? selected : undefined}
      className={`w-full px-3.5 py-3 border-t border-border first:border-t-0 text-left cursor-pointer select-none ${
        selected ? 'bg-primary-soft' : 'hover:bg-surface-2'
      }`}
    >
      <div className="flex gap-3">
        {selectMode && (
          <span aria-hidden="true" className={`mt-0.5 w-5 h-5 rounded-full border grid place-items-center shrink-0 text-[11px] font-bold ${
            selected ? 'bg-primary border-primary text-on-primary' : 'border-border text-transparent'
          }`}>✓</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex"><TxRowContent t={tx} catMap={catMap} hideAccount /></div>
          <div className="text-[11px] text-faint text-right mt-1 tabular">
            {t('accountDetail.balance')} <span className="font-semibold text-muted">{formatSigned(balance, currency)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
