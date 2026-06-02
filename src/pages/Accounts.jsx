import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { listGroups, listAccounts, listAllTransactions, listRates } from '../lib/data'
import { accountSubtitle, formatMoney } from '../lib/format'
import { computeBalances, toBase, netWorth, creditCardBilling } from '../lib/balances'
import { Button } from '../components/ui'
import { PlusIcon } from '../lib/icons'

// "2026-07-05" -> "5 Jul"
function shortDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short' })}`
}

export default function Accounts() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [accounts, setAccounts] = useState([])
  const [txns, setTxns] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listGroups(), listAccounts(), listAllTransactions(), listRates()]).then(([g, a, t, r]) => {
      if (!g.error) setGroups(g.data ?? [])
      if (!a.error) setAccounts(a.data ?? [])
      if (!t.error) setTxns(t.data ?? [])
      if (!r.error) setRates(Object.fromEntries((r.data ?? []).map((x) => [x.currency, Number(x.rate)])))
      setLoading(false)
    })
  }, [])

  const base = profile?.base_currency ?? 'IDR'
  const active = accounts.filter((a) => !a.archived)
  const balances = computeBalances(txns, accounts)
  const inGroup = (gid) => active.filter((a) => (a.group_id ?? null) === gid)
  const ungrouped = inGroup(null)
  const nw = netWorth(active, balances, rates, base)

  // Sum of member balances converted to base (skips currencies without a rate).
  const rollup = (accts) =>
    accts.reduce((s, a) => s + (toBase(balances.get(a.id) ?? 0, a.currency, rates, base) ?? 0), 0)

  if (loading) return <p className="text-muted text-sm py-8 text-center">Loading…</p>

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Net worth */}
      <div className="bg-surface border border-border rounded-[14px] p-[18px]">
        <div className="text-xs font-semibold text-muted">Net worth · in base currency ({base})</div>
        <div className="text-[27px] font-extrabold mt-1.5 tracking-[-.5px] text-primary tabular">
          {active.length === 0 ? '—' : formatMoney(nw.total, base)}
        </div>
        {nw.missing.length > 0 && (
          <button onClick={() => navigate('/settings/rates')} className="text-[11px] text-expense mt-1 hover:underline">
            Set a rate for {nw.missing.join(', ')} to include {nw.missing.length > 1 ? 'them' : 'it'}.
          </button>
        )}
      </div>

      {active.length === 0 ? (
        <div className="bg-surface border border-border rounded-[14px] p-6 mt-3 text-center">
          <p className="text-sm text-muted mb-4">No accounts yet. Create your first account to see it here.</p>
          <Button onClick={() => navigate('/settings/accounts')}>
            <PlusIcon className="w-[18px] h-[18px]" /> Add an account
          </Button>
        </div>
      ) : (
        <>
          {groups.map((g) =>
            inGroup(g.id).length > 0 ? (
              <AccountGroup key={g.id} title={g.name} rollup={formatMoney(rollup(inGroup(g.id)), base)}
                accounts={inGroup(g.id)} balances={balances} txns={txns} rates={rates} base={base} />
            ) : null
          )}
          {ungrouped.length > 0 && (
            <AccountGroup title={groups.length > 0 ? 'Ungrouped' : 'Accounts'}
              rollup={groups.length > 0 ? formatMoney(rollup(ungrouped), base) : null}
              accounts={ungrouped} balances={balances} txns={txns} rates={rates} base={base} />
          )}

          <div className="text-center mt-5">
            <button onClick={() => navigate('/settings/accounts')} className="text-xs font-semibold text-faint hover:text-muted">
              Manage accounts & groups
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AccountGroup({ title, rollup, accounts, balances, txns, rates, base }) {
  return (
    <div className="bg-surface border border-border rounded-[14px] overflow-hidden mt-3">
      <div className="flex justify-between gap-3 px-3.5 py-2.5 text-xs font-bold text-faint bg-surface-2">
        <span className="truncate uppercase tracking-wide">{title}</span>
        {rollup && <span className="tabular shrink-0">{rollup}</span>}
      </div>
      {accounts.map((a) => (
        <AccountRow key={a.id} a={a} balance={balances.get(a.id) ?? 0} txns={txns} rates={rates} base={base} />
      ))}
    </div>
  )
}

function AccountRow({ a, balance, txns, rates, base }) {
  const isCC = a.type === 'credit_card'
  const billing = isCC ? creditCardBilling(a, txns, balance) : null
  const negative = balance < 0
  const approx = a.currency !== base ? toBase(balance, a.currency, rates, base) : null

  return (
    <div className="flex gap-3 items-start px-3.5 py-3 border-t border-border">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[14.5px] leading-tight truncate">{a.name}</div>
        <div className="text-xs text-muted mt-1 truncate">{accountSubtitle(a)}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-bold text-[14.5px] tabular ${negative ? 'text-expense' : 'text-text'}`}>
          {formatMoney(balance, a.currency)}
        </div>
        {isCC && billing.outstanding > 0 && (
          <div className="text-[11px] text-muted mt-0.5">
            Payable {formatMoney(billing.payable, a.currency)}{billing.nextDue ? ` · due ${shortDate(billing.nextDue)}` : ''}
          </div>
        )}
        {approx != null && (
          <div className="text-[11px] text-faint mt-0.5">≈ {formatMoney(approx, base)}</div>
        )}
      </div>
    </div>
  )
}
