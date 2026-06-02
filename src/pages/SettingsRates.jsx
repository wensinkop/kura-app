import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { listAccounts, listRates, upsertRate, deleteRate } from '../lib/data'
import { localeFor, currencyDecimals } from '../lib/currencies'
import NumberInput from '../components/NumberInput'
import { Button } from '../components/ui'

// Manual exchange rates: how much 1 unit of each foreign currency is worth in the
// base currency. Only currencies actually used by the user's accounts appear.
export default function SettingsRates() {
  const { user, profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const [accounts, setAccounts] = useState([])
  const [rates, setRates] = useState({}) // currency -> number
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([listAccounts(), listRates()]).then(([a, r]) => {
      if (!a.error) setAccounts(a.data ?? [])
      if (!r.error) setRates(Object.fromEntries((r.data ?? []).map((x) => [x.currency, Number(x.rate)])))
      setLoading(false)
    })
  }, [])

  const currencies = [...new Set(accounts.filter((a) => !a.archived).map((a) => a.currency))]
    .filter((c) => c !== base)
    .sort()

  async function saveAll() {
    setSaving(true)
    for (const c of currencies) {
      const v = rates[c]
      if (v && v > 0) await upsertRate(user.id, c, v)
      else await deleteRate(user.id, c) // cleared → remove so it shows as "missing"
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <p className="text-muted text-sm py-8 text-center">Loading…</p>

  return (
    <div className="max-w-[640px] mx-auto">
      <p className="text-sm text-muted mb-4 px-1">
        Set how much <strong>1 unit</strong> of each foreign currency is worth in {base}. Kura uses
        these to convert balances into your net worth — update them whenever rates move.
      </p>

      {currencies.length === 0 ? (
        <div className="bg-surface border border-border rounded-[14px] p-6 text-center text-sm text-muted">
          All your accounts use {base}, so no exchange rates are needed yet. Add a foreign-currency
          account and it’ll appear here.
        </div>
      ) : (
        <>
          <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
            {currencies.map((c) => (
              <div key={c} className="flex items-center gap-3 px-3.5 py-3 border-t border-border first:border-t-0">
                <div className="font-bold text-[14.5px] w-12 shrink-0">{c}</div>
                <span className="text-sm text-muted shrink-0">1 {c} =</span>
                <div className="flex-1 min-w-0">
                  <NumberInput value={rates[c] ?? null} onChange={(v) => setRates((s) => ({ ...s, [c]: v }))}
                    locale={localeFor(base)} currency={base} decimals={currencyDecimals(base)} placeholder="0" />
                </div>
              </div>
            ))}
          </div>
          <Button className="mt-4 w-full" onClick={saveAll} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save rates'}
          </Button>
        </>
      )}
    </div>
  )
}
