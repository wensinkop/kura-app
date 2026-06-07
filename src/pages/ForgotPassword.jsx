import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError, AuthNotice } from '../components/AuthLayout'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetSubtitle')}
      footer={<Link to="/signin" className="text-primary hover:underline">{t('auth.backToSignIn')}</Link>}
    >
      {sent ? (
        <AuthNotice>{t('auth.resetSent', { email })}</AuthNotice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>{t('auth.email')}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} required />
          </div>
          <AuthError>{error}</AuthError>
          <button type="submit" disabled={loading} className={authBtn}>
            {loading ? t('auth.sending') : t('auth.sendResetLink')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
