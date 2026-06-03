// Admin area (Chunk 8). Admin-only route (guarded in App.jsx by AdminRoute).
// Lists every user and lets an admin set their subscription_tier (manual
// billing) and role. All reads/writes go through SECURITY DEFINER RPCs that
// re-check the caller is an admin — the client guard is only for the UI.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import Sidebar from '../components/Sidebar'
import { Modal, Button, Segmented, TextInput } from '../components/ui'
import { ChevronLeft } from '../lib/icons'
import { adminListUsers, adminSetTier, adminSetRole } from '../lib/data'

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

function Pill({ children, tone }) {
  const tones = {
    premium: 'text-primary border-primary/40',
    admin: 'text-income border-income/40',
    plain: 'text-faint border-border',
  }
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-1.5 py-0.5 ${tones[tone] ?? tones.plain}`}>
      {children}
    </span>
  )
}

export default function Admin() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // the user row being edited

  // State updates live inside the .then callback (not the synchronous body), so
  // this is safe to call from the mount effect and again after an edit.
  function load() {
    return adminListUsers().then(({ data, error }) => {
      if (error) setError(error.message || 'Could not load users.')
      else {
        setUsers(data ?? [])
        setError('')
      }
      setLoading(false)
    })
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => (u.full_name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)
    )
  }, [users, query])

  const premiumCount = users.filter((u) => u.subscription_tier === 'premium').length

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 py-2.5 flex items-center gap-2">
          <button onClick={() => navigate('/settings')} aria-label="Back" className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="font-bold text-[15px] flex-1">Admin · users</div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-income border border-income/40 rounded-full px-2 py-0.5">Admin</span>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4 desk:px-8 w-full">
          <div className="max-w-[640px] mx-auto">
            {error && (
              <div className="mb-4 rounded-xl border border-expense/40 bg-expense/10 px-3.5 py-3 text-[13.5px] text-expense">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 mb-3">
              <TextInput
                placeholder="Search name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="text-xs text-faint mb-3 px-1">
              {users.length} user{users.length === 1 ? '' : 's'} · {premiumCount} premium
            </div>

            {loading ? (
              <p className="text-muted text-sm py-8 text-center">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted text-sm py-8 text-center">No users match.</p>
            ) : (
              <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
                {filtered.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setEditing(u)}
                    className="w-full flex gap-3 items-center px-3.5 py-3 border-t border-border first:border-t-0 text-left hover:bg-surface-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14.5px] text-text truncate">
                        {u.full_name || 'No name'}
                        {u.id === user?.id && <span className="text-faint font-normal"> · you</span>}
                      </div>
                      <div className="text-xs text-muted truncate mt-0.5">{u.email}</div>
                      <div className="text-[11px] text-faint mt-0.5">Joined {fmtDate(u.created_at)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {u.subscription_tier === 'premium' ? <Pill tone="premium">Premium</Pill> : <Pill tone="plain">Free</Pill>}
                      {u.role === 'admin' && <Pill tone="admin">Admin</Pill>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {editing && (
        <EditUserModal
          row={editing}
          isSelf={editing.id === user?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function EditUserModal({ row, isSelf, onClose, onSaved }) {
  const [tier, setTier] = useState(row.subscription_tier)
  const [role, setRole] = useState(row.role)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const changed = tier !== row.subscription_tier || role !== row.role
  const selfLockout = isSelf && role !== 'admin' // server blocks this too

  async function save() {
    setBusy(true)
    setErr('')
    try {
      if (tier !== row.subscription_tier) {
        const { error } = await adminSetTier(row.id, tier)
        if (error) throw error
      }
      if (role !== row.role) {
        const { error } = await adminSetRole(row.id, role)
        if (error) throw error
      }
      onSaved()
    } catch (e) {
      setErr(e.message || 'Could not save changes.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={row.full_name || row.email}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={busy || !changed || selfLockout}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-[13px] text-muted">{row.email}</div>

        {err && (
          <div className="rounded-xl border border-expense/40 bg-expense/10 px-3.5 py-2.5 text-[13px] text-expense">
            {err}
          </div>
        )}

        <div>
          <div className="text-[11px] font-semibold text-muted mb-1.5 pl-0.5">Subscription</div>
          <Segmented
            value={tier}
            onChange={setTier}
            options={[
              { value: 'free', label: 'Free' },
              { value: 'premium', label: 'Premium' },
            ]}
          />
        </div>

        <div>
          <div className="text-[11px] font-semibold text-muted mb-1.5 pl-0.5">Role</div>
          <Segmented
            value={role}
            onChange={setRole}
            options={[
              { value: 'user', label: 'User' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
          {isSelf && role !== 'admin' && (
            <p className="text-[11px] text-expense mt-1.5 pl-0.5">You can’t remove your own admin role.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
