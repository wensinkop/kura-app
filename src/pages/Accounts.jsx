import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { listGroups, listAccounts } from '../lib/data'
import { accountSubtitle } from '../lib/format'
import { Button } from '../components/ui'
import { PlusIcon } from '../lib/icons'

// Accounts overview. Chunk 1 shows the real account structure (names, type,
// currency, credit-card cycle) grouped exactly like the locked mockup. Balances
// and net worth are Chunk 3 — shown as a "—" placeholder for now.
export default function Accounts() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listGroups(), listAccounts()]).then(([g, a]) => {
      if (!g.error) setGroups(g.data ?? [])
      if (!a.error) setAccounts(a.data ?? [])
      setLoading(false)
    })
  }, [])

  // Only active accounts on the overview; archived ones stay in Settings.
  const active = accounts.filter((a) => !a.archived)
  const inGroup = (gid) => active.filter((a) => (a.group_id ?? null) === gid)
  const ungrouped = inGroup(null)
  const baseCurrency = profile?.base_currency ?? 'IDR'

  if (loading) return <p className="text-muted text-sm py-8 text-center">Loading…</p>

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Net-worth card — value lands in Chunk 3 */}
      <div className="bg-surface border border-border rounded-[14px] p-[18px]">
        <div className="text-xs font-semibold text-muted">Net worth · in base currency ({baseCurrency})</div>
        <div className="text-[27px] font-extrabold mt-1.5 tracking-[-.5px] text-primary tabular">—</div>
        <div className="text-[11px] text-faint mt-1">Balances arrive in Chunk 3</div>
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
              <AccountGroup key={g.id} title={g.name} accounts={inGroup(g.id)} />
            ) : null
          )}
          {ungrouped.length > 0 && (
            <AccountGroup title={groups.length > 0 ? 'Ungrouped' : 'Accounts'} accounts={ungrouped} />
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

function AccountGroup({ title, accounts }) {
  return (
    <div className="bg-surface border border-border rounded-[14px] overflow-hidden mt-3">
      <div className="px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide text-faint bg-surface-2">{title}</div>
      {accounts.map((a) => (
        <div key={a.id} className="flex gap-3 items-start px-3.5 py-3 border-t border-border">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[14.5px] leading-tight truncate">{a.name}</div>
            <div className="text-xs text-muted mt-1 truncate">{accountSubtitle(a)}</div>
          </div>
          <div className="text-right font-bold text-[14.5px] text-faint tabular shrink-0">—</div>
        </div>
      ))}
    </div>
  )
}
