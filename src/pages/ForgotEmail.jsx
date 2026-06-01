import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError, AuthNotice } from '../components/AuthLayout'

// "Forgot which email" — the user suspects one of their addresses. We send a
// magic sign-in link to the address they enter; if an account exists, clicking
// it signs them in, and they can confirm the address in Settings. We never
// reveal whether an account exists (no account enumeration).
export default function ForgotEmail() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <AuthLayout
      title="Find your account"
      subtitle="Not sure which email you signed up with? Enter one you might have used and we'll send a sign-in link to it."
      footer={<Link to="/signin" className="text-primary hover:underline">← Back to sign in</Link>}
    >
      {sent ? (
        <AuthNotice>
          If an account exists for {email}, a sign-in link is on its way. Open it to sign in — that
          confirms this is your email. If nothing arrives, try another address.
        </AuthNotice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>Email to try</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} required />
          </div>
          <AuthError>{error}</AuthError>
          <button type="submit" disabled={loading} className={authBtn}>
            {loading ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
