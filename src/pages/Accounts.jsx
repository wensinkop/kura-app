import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { listGroups, listAccounts, getAccountBalances, listTransactionsForAccounts, listRates } from '../lib/data'
import { cacheGet, cacheSet } from '../lib/cache'
import { accountSubtitle, formatAbs, formatSigned, amountColor } from '../lib/format'
import { toBase, netWorth, creditCardBilling } from '../lib/balances'
import { Button } from '../components/ui'
import { PlusIcon, ChevronRight } from '../lib/icons'

import i18n from '../i18n'
// "2026-07-05" -> "5 Jul" (month name in the UI language).
function shortDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${new Date(y, m - 1, d).toLocaleDateString(i18n.language || 'en', { month: 'short' })}`
}

export default function Accounts() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const navigate = useNavigate()
  // Seed from the session cache so revisiting Accounts is instant; the effect
  // still refetches in the background. Balances come from a DB aggregate (not
  // every transaction); only the credit-card accounts' transactions are fetched
  // (for the billing line).
  const balMap = (rows) => new Map((rows ?? []).map((x) => [x.account_id, Number(x.balance)]))
  const allCached = cacheGet('groups') !== undefined && cacheGet('accounts') !== undefined &&
    cacheGet('balances') !== undefined && cacheGet('rates') !== undefined
  const [groups, setGroups] = useState(() => cacheGet('groups') ?? [])
  const [accounts, setAccounts] = useState(() => cacheGet('accounts') ?? [])
  const [balances, setBalances] = useState(() => balMap(cacheGet('balances')))
  const [ccTxns, setCcTxns] = useState(() => cacheGet('ccTxns') ?? [])
  const [rates, setRates] = useState(() => Object.fromEntries((cacheGet('rates') ?? []).map((x) => [x.currency, Number(x.rate)])))
  const [loading, setLoading] = useState(() => !allCached)

  useEffect(() => {
    Promise.all([listGroups(), listAccounts(), getAccountBalances(), listRates()]).then(([g, a, bal, r]) => {
      if (!g.error) { setGroups(g.data ?? []); cacheSet('groups', g.data ?? []) }
      if (!a.error) { setAccounts(a.data ?? []); cacheSet('accounts', a.data ?? []) }
      if (!bal.error) { setBalances(balMap(bal.data)); cacheSet('balances', bal.data ?? []) }
      if (!r.error) { setRates(Object.fromEntries((r.data ?? []).map((x) => [x.currency, Number(x.rate)]))); cacheSet('rates', r.data ?? []) }
      const ccIds = (a.data ?? []).filter((x) => x.type === 'credit_card' && !x.archived).map((x) => x.id)
      if (ccIds.length) {
        listTransactionsForAccounts(ccIds).then(({ data, error }) => {
          if (!error) { setCcTxns(data ?? []); cacheSet('ccTxns', data ?? []) }
        })
      } else { setCcTxns([]); cacheSet('ccTxns', []) }
      setLoading(false)
    })
  }, [])

  const base = profile?.base_currency ?? 'IDR'
  const active = accounts.filter((a) => !a.archived) // includes goal accounts → net worth counts them
  const listed = active.filter((a) => !a.is_goal) // goal accounts are managed in Goals, hidden from this list
  const inGroup = (gid) => listed.filter((a) => (a.group_id ?? null) === gid)
  const ungrouped = inGroup(null)
  const nw = netWorth(active, balances, rates, base)

  // Sum of member balances converted to base (skips currencies without a rate).
  const rollup = (accts) =>
    accts.reduce((s, a) => s + (toBase(balances.get(a.id) ?? 0, a.currency, rates, base) ?? 0), 0)

  if (loading) return <p className="text-muted text-sm py-8 text-center">{t('common.loading')}</p>

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Net worth */}
      <div className="bg-surface border border-border rounded-[14px] p-[18px]">
        <div className="text-xs font-semibold text-muted">{t('account.netWorth', { base })}</div>
        <div className={`text-[27px] font-extrabold mt-1.5 tracking-[-.5px] tabular ${
          active.length === 0 ? 'text-primary' : nw.total < 0 ? 'text-expense' : 'text-primary'
        }`}>
          {active.length === 0 ? '—' : formatSigned(nw.total, base)}
        </div>
        {nw.missing.length > 0 && (
          <button onClick={() => navigate('/settings/rates')} className="text-[11px] text-expense mt-1 hover:underline">
            {t('account.setRate', { list: nw.missing.join(', '), count: nw.missing.length })}
          </button>
        )}
      </div>

      {/* Goals entry — lives under Accounts (a savings target backed by an account).
          Opt-in via Settings → Preferences. */}
      {profile?.goals_enabled && (
        <button onClick={() => navigate('/goals')}
          className="w-full mt-3 bg-surface border border-border rounded-[14px] px-4 py-3.5 flex items-center gap-3 text-left hover:bg-surface-2">
          <span className="w-9 h-9 rounded-full bg-primary-soft grid place-items-center shrink-0 text-lg">🎯</span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-[14.5px]">{t('goals.section')}</span>
            <span className="block text-xs text-muted">{t('goals.accountsSub')}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-faint shrink-0" />
        </button>
      )}

      {listed.length === 0 ? (
        <div className="bg-surface border border-border rounded-[14px] p-6 mt-3 text-center">
          <p className="text-sm text-muted mb-4">{t('account.empty')}</p>
          <Button onClick={() => navigate('/settings/accounts')}>
            <PlusIcon className="w-[18px] h-[18px]" /> {t('account.addAccount')}
          </Button>
        </div>
      ) : (
        <>
          {groups.map((g) =>
            inGroup(g.id).length > 0 ? (
              <AccountGroup key={g.id} title={g.name} rollupValue={rollup(inGroup(g.id))}
                accounts={inGroup(g.id)} balances={balances} txns={ccTxns} rates={rates} base={base} />
            ) : null
          )}
          {ungrouped.length > 0 && (
            <AccountGroup title={groups.length > 0 ? t('account.ungrouped') : t('nav.accounts')}
              rollupValue={groups.length > 0 ? rollup(ungrouped) : null}
              accounts={ungrouped} balances={balances} txns={ccTxns} rates={rates} base={base} />
          )}

          <div className="text-center mt-5">
            <button onClick={() => navigate('/settings/accounts')} className="text-xs font-semibold text-faint hover:text-muted">
              {t('account.manage')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AccountGroup({ title, rollupValue, accounts, balances, txns, rates, base }) {
  return (
    <div className="bg-surface border border-border rounded-[14px] overflow-hidden mt-3">
      <div className="flex justify-between gap-3 px-3.5 py-2.5 text-xs font-bold text-faint bg-surface-2">
        <span className="truncate uppercase tracking-wide">{title}</span>
        {rollupValue != null && <span className={`tabular shrink-0 ${amountColor(rollupValue)}`}>{formatSigned(rollupValue, base)}</span>}
      </div>
      {accounts.map((a) => (
        <AccountRow key={a.id} a={a} balance={balances.get(a.id) ?? 0} txns={txns} rates={rates} base={base} />
      ))}
    </div>
  )
}

function AccountRow({ a, balance, txns, rates, base }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isCC = a.type === 'credit_card'
  const billing = isCC ? creditCardBilling(a, txns, balance) : null
  const approx = a.currency !== base ? toBase(balance, a.currency, rates, base) : null

  return (
    <button onClick={() => navigate(`/accounts/${a.id}`)} className="w-full text-left px-3.5 py-3 border-t border-border hover:bg-surface-2">
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14.5px] leading-tight truncate">{a.name}</div>
          <div className="text-xs text-muted mt-1 truncate">{accountSubtitle(a)}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-bold text-[14.5px] tabular ${amountColor(balance)}`}>
            {formatSigned(balance, a.currency)}
          </div>
          {approx != null && (
            <div className="text-[11px] text-faint mt-0.5">≈ {formatSigned(approx, base)}</div>
          )}
        </div>
      </div>
      {/* Credit-card billing on its own full-width line so it never clips on mobile. */}
      {isCC && billing.outstanding > 0 && (
        <div className="text-[11px] text-muted mt-1.5 pt-1.5 border-t border-border/60 flex justify-between gap-2">
          <span>{t('account.payable', { amount: formatAbs(billing.payable, a.currency) })}</span>
          {billing.nextDue && <span className="text-faint">{t('account.dueDate', { date: shortDate(billing.nextDue) })}</span>}
        </div>
      )}
    </button>
  )
}
