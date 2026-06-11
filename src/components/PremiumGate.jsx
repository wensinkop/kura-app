// Reusable Premium gate. Wrap any premium-only screen with <PremiumGate>;
// Premium users (resolved via isPremium — lifetime / active sub / active trial /
// manual grant) see the feature, everyone else gets an on-brand upgrade screen.
// Billing is manual/admin-granted for now (Chunk 8) — the upgrade action requests
// access by email; swap in a real checkout later without touching the gated screens.

import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { isPremium } from '../lib/entitlement'
import Sidebar from './Sidebar'
import { Button } from './ui'
import { ChevronLeft, SparkleIcon } from '../lib/icons'

const UPGRADE_EMAIL = 'stan.leeansyah@gmail.com'

export default function PremiumGate({
  feature = 'This feature',
  tagline = 'A Premium feature',
  perks = [],
  back = '/settings',
  children,
}) {
  const { profile, user, loading } = useAuth()
  const navigate = useNavigate()

  // ProtectedRoute already waited out auth/profile loading; this is just a guard.
  if (loading) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-bg">
        <p className="text-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (isPremium(profile)) return children

  const subject = `Smara Premium — request access`
  const body = `Hi, I'd like to upgrade to Smara Premium.\n\nMy account email: ${user?.email ?? ''}\n`
  const mailto = `mailto:${UPGRADE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 py-2.5 flex items-center gap-2">
          <button
            onClick={() => navigate(back)}
            aria-label="Back"
            className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2"
          >
            <ChevronLeft />
          </button>
          <div className="font-bold text-[15px] flex-1">{feature}</div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary border border-primary/40 rounded-full px-2 py-0.5">
            Premium
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 desk:px-8 w-full">
          <div className="max-w-[460px] mx-auto">
            <div className="bg-surface border border-border rounded-[18px] p-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-primary-soft text-primary grid place-items-center mb-4">
                <SparkleIcon className="w-7 h-7" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">
                {tagline}
              </div>
              <h1 className="text-[20px] font-extrabold text-text mb-2">{feature}</h1>

              {perks.length > 0 && (
                <ul className="text-left text-[14px] text-muted leading-relaxed mt-4 space-y-2">
                  {perks.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <span className="text-primary mt-0.5 shrink-0">✓</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 rounded-xl bg-surface-2 border border-border px-3.5 py-3 text-[13px] text-muted leading-relaxed">
                Premium is <span className="font-semibold text-text">invite-only</span> right now.
                Tap below to request access and we’ll set you up.
              </div>

              <a href={mailto} className="block mt-4">
                <Button className="w-full">Request access</Button>
              </a>
              <button
                onClick={() => navigate(back)}
                className="mt-3 text-[13px] font-semibold text-muted hover:text-text"
              >
                Maybe later
              </button>
            </div>

            <p className="text-center text-xs text-faint py-6">Smara · steady, patient, protected 🐢</p>
          </div>
        </main>
      </div>
    </div>
  )
}
