import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError, AuthNotice } from '../components/AuthLayout'

// Reached via the reset link in the user's email. Supabase (detectSessionInUrl)
// establishes a short-lived recovery session on arrival; we then let them set a
// new password with updateUser().
export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // A recovery link yields either an existing session or a PASSWORD_RECOVERY event.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  return (
    <AuthLayout
      title="Set a new password"
      footer={<Link to="/signin" className="text-primary hover:underline">← Back to sign in</Link>}
    >
      {done ? (
        <AuthNotice>Password updated. Taking you in…</AuthNotice>
      ) : !ready ? (
        <p className="text-sm text-muted">
          Open this page from the reset link in your email. If you got here another way, request a new
          link from <Link to="/forgot-password" className="text-primary hover:underline">Forgot password</Link>.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} placeholder="At least 6 characters" required />
          </div>
          <div>
            <label className={authLabel}>Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authInput} required />
          </div>
          <AuthError>{error}</AuthError>
          <button type="submit" disabled={loading} className={authBtn}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
