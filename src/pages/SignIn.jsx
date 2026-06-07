import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError, PasswordInput } from '../components/AuthLayout'
import { friendlyAuthError } from '../lib/authErrors'

export default function SignIn() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(friendlyAuthError(error, t)); return }
    navigate('/')
  }

  return (
    <AuthLayout
      title={t('auth.welcomeBack')}
      footer={<>{t('auth.noAccount')} <Link to="/signup" className="text-primary hover:underline">{t('auth.createOne')}</Link></>}
    >
      <form onSubmit={handleSignIn} className="space-y-4">
        <div>
          <label className={authLabel}>{t('auth.email')}</label>
          <input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} required />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-muted">{t('auth.password')}</label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">{t('auth.forgotPassword')}</Link>
          </div>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <AuthError>{error}</AuthError>
        <button type="submit" disabled={loading} className={authBtn}>
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
        <Link to="/forgot-email" className="block w-full text-center text-sm text-muted hover:text-primary">
          {t('auth.forgotEmail')}
        </Link>
      </form>
    </AuthLayout>
  )
}
