// Account management (Account chunk): change email, change password, and delete
// account. The page renders inside AppShell (so it gets the back arrow). Auth
// calls go straight to supabase.auth; deletion goes through the SECURITY DEFINER
// delete_own_account RPC, then signs out.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { supabase } from '../supabaseClient'
import { deleteOwnAccount } from '../lib/data'
import { Modal, Button, Field, TextInput } from '../components/ui'

function SectionTitle({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wide text-faint mt-5 mb-2 px-1 first:mt-0">{children}</div>
  )
}
function Card({ children }) {
  return <div className="bg-surface border border-border rounded-[14px] p-4">{children}</div>
}
function Banner({ msg }) {
  if (!msg) return null
  const ok = msg.tone === 'ok'
  return (
    <div className={`mt-3 rounded-xl border px-3.5 py-2.5 text-[13px] ${ok ? 'border-income/40 bg-income/10 text-income' : 'border-expense/40 bg-expense/10 text-expense'}`}>
      {msg.text}
    </div>
  )
}

export default function SettingsAccount() {
  const { user, profile, signOut, updateProfile } = useAuth()
  const navigate = useNavigate()

  // ---- Change name ---------------------------------------------------------
  const [name, setName] = useState(profile?.full_name ?? '')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameMsg, setNameMsg] = useState(null)

  async function submitName(e) {
    e.preventDefault()
    setNameMsg(null)
    const n = name.trim()
    if (n.length < 2) { setNameMsg({ tone: 'err', text: 'Please enter your name.' }); return }
    setNameBusy(true)
    const { error } = await updateProfile({ full_name: n })
    setNameBusy(false)
    if (error) { setNameMsg({ tone: 'err', text: 'Could not save your name.' }); return }
    setNameMsg({ tone: 'ok', text: 'Name updated.' })
  }

  // ---- Change email --------------------------------------------------------
  const [email, setEmail] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)

  async function submitEmail(e) {
    e.preventDefault()
    setEmailMsg(null)
    const next = email.trim()
    if (!next || !next.includes('@')) { setEmailMsg({ tone: 'err', text: 'Enter a valid email address.' }); return }
    if (next.toLowerCase() === (user?.email ?? '').toLowerCase()) { setEmailMsg({ tone: 'err', text: 'That’s already your email.' }); return }
    setEmailBusy(true)
    const { error } = await supabase.auth.updateUser({ email: next })
    setEmailBusy(false)
    if (error) { setEmailMsg({ tone: 'err', text: error.message }); return }
    setEmail('')
    setEmailMsg({ tone: 'ok', text: `Almost there — we sent a confirmation link to ${next}. Your email changes once you click it (you may also get a heads-up at your current address).` })
  }

  // ---- Change password -----------------------------------------------------
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  async function submitPassword(e) {
    e.preventDefault()
    setPwMsg(null)
    if (newPw.length < 6) { setPwMsg({ tone: 'err', text: 'New password must be at least 6 characters.' }); return }
    if (newPw !== confirmPw) { setPwMsg({ tone: 'err', text: 'New passwords don’t match.' }); return }
    setPwBusy(true)
    // Re-verify the current password so an unattended session can't change it.
    const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: curPw })
    if (verifyErr) { setPwBusy(false); setPwMsg({ tone: 'err', text: 'Current password is incorrect.' }); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwBusy(false); setPwMsg({ tone: 'err', text: error.message }); return }
    // Security: changing the password boots every other signed-in device
    // (keeps this one). 'others' revokes their refresh tokens.
    await supabase.auth.signOut({ scope: 'others' })
    setPwBusy(false)
    setCurPw(''); setNewPw(''); setConfirmPw('')
    setPwMsg({ tone: 'ok', text: 'Password updated. Any other devices have been signed out.' })
  }

  // ---- Sessions ------------------------------------------------------------
  const [sessBusy, setSessBusy] = useState(false)
  async function signOutEverywhere() {
    setSessBusy(true)
    await signOut('global') // this device + all others
    navigate('/signin', { replace: true }) // onAuthStateChange also redirects; this is a fallback
  }

  // ---- Delete account ------------------------------------------------------
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delErr, setDelErr] = useState('')

  async function confirmDelete() {
    setDelBusy(true); setDelErr('')
    const { error } = await deleteOwnAccount()
    if (error) { setDelBusy(false); setDelErr(error.message || 'Could not delete the account.'); return }
    await signOut()
    navigate('/signin', { replace: true })
  }

  return (
    <div className="max-w-[640px] mx-auto">
      <SectionTitle>Signed in as</SectionTitle>
      <Card>
        <div className="text-[14.5px] font-semibold text-text">{user?.email}</div>
        <div className="text-xs text-muted mt-0.5">Manage your name and sign-in details below.</div>
      </Card>

      <SectionTitle>Your name</SectionTitle>
      <Card>
        <form onSubmit={submitName} className="space-y-3">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" maxLength={60} />
          </Field>
          <Button type="submit" disabled={nameBusy}>{nameBusy ? 'Saving…' : 'Save name'}</Button>
        </form>
        <Banner msg={nameMsg} />
      </Card>

      <SectionTitle>Change email</SectionTitle>
      <Card>
        <form onSubmit={submitEmail} className="space-y-3">
          <Field label="New email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </Field>
          <Button type="submit" disabled={emailBusy}>{emailBusy ? 'Sending…' : 'Send confirmation link'}</Button>
        </form>
        <Banner msg={emailMsg} />
      </Card>

      <SectionTitle>Change password</SectionTitle>
      <Card>
        <form onSubmit={submitPassword} className="space-y-3">
          <Field label="Current password">
            <TextInput type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 6 characters.">
            <TextInput type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <TextInput type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button type="submit" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Update password'}</Button>
        </form>
        <Banner msg={pwMsg} />
      </Card>

      <SectionTitle>Devices</SectionTitle>
      <Card>
        <div className="font-semibold text-[14.5px] text-text">Sign out of all devices</div>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Signs you out of Smara everywhere — this device and any others (a shared phone, an old device,
          or a partner you no longer want to have access). You’ll need to sign in again. Changing your
          password also signs out other devices automatically.
        </p>
        <Button variant="ghost" className="mt-3" onClick={signOutEverywhere} disabled={sessBusy}>
          {sessBusy ? 'Signing out…' : 'Sign out of all devices'}
        </Button>
      </Card>

      <SectionTitle>Danger zone</SectionTitle>
      <div className="bg-surface border border-expense/40 rounded-[14px] p-4">
        <div className="font-semibold text-[14.5px] text-text">Delete account</div>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Permanently deletes your account and all your data — accounts, transactions, categories and settings.
          This can’t be undone. Consider downloading a backup first (Settings → Backup &amp; data).
        </p>
        <Button variant="danger" className="mt-3" onClick={() => { setDelOpen(true); setDelText(''); setDelErr('') }}>
          Delete my account
        </Button>
      </div>

      {delOpen && (
        <Modal
          title="Delete account"
          onClose={() => !delBusy && setDelOpen(false)}
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setDelOpen(false)} disabled={delBusy}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={confirmDelete} disabled={delBusy || delText !== 'DELETE'}>
                {delBusy ? 'Deleting…' : 'Delete everything'}
              </Button>
            </>
          }
        >
          <p className="text-[14px] text-muted leading-relaxed">
            This permanently deletes your account and <span className="font-semibold text-text">all your data</span>. It can’t be undone.
          </p>
          <p className="text-[13px] text-muted mt-3 mb-1.5">Type <span className="font-bold text-text">DELETE</span> to confirm</p>
          <TextInput value={delText} onChange={(e) => setDelText(e.target.value)} placeholder="DELETE" autoFocus />
          {delErr && <p className="text-[13px] text-expense mt-2">{delErr}</p>}
        </Modal>
      )}
    </div>
  )
}
