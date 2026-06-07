import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError, AuthNotice } from '../components/AuthLayout'

// "Forgot which email" — the user suspects one of their addresses. We send a
// magic sign-in link to the address they enter; if an account exists, clicking
// it signs them in, and they can confirm the address in Settings. We never
// reveal whether an account exists (no account enumeration).
export default function ForgotEmail() {
  const { t } = useTranslation()
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
      title={t('auth.findTitle')}
      subtitle={t('auth.findSubtitle')}
      footer={<Link to="/signin" className="text-primary hover:underline">{t('auth.backToSignIn')}</Link>}
    >
      {sent ? (
        <AuthNotice>{t('auth.findSent', { email })}</AuthNotice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>{t('auth.emailToTry')}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} required />
          </div>
          <AuthError>{error}</AuthError>
          <button type="submit" disabled={loading} className={authBtn}>
            {loading ? t('auth.sending') : t('auth.sendSignInLink')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
