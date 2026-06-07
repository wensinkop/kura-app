import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError, AuthNotice } from '../components/AuthLayout'

// Reached via the reset link in the user's email. Supabase (detectSessionInUrl)
// establishes a short-lived recovery session on arrival; we then let them set a
// new password with updateUser().
export default function ResetPassword() {
  const { t } = useTranslation()
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
    if (password.length < 6) { setError(t('auth.errPwMin')); return }
    if (password !== confirm) { setError(t('auth.errPwMismatch')); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  return (
    <AuthLayout
      title={t('auth.setNewTitle')}
      footer={<Link to="/signin" className="text-primary hover:underline">{t('auth.backToSignIn')}</Link>}
    >
      {done ? (
        <AuthNotice>{t('auth.updated')}</AuthNotice>
      ) : !ready ? (
        <p className="text-sm text-muted">
          {t('auth.openFromLinkPre')}{' '}
          <Link to="/forgot-password" className="text-primary hover:underline">{t('auth.forgotPasswordLink')}</Link>.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>{t('auth.newPassword')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} placeholder={t('auth.passwordPlaceholder')} required />
          </div>
          <div>
            <label className={authLabel}>{t('auth.confirmNewPassword')}</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authInput} required />
          </div>
          <AuthError>{error}</AuthError>
          <button type="submit" disabled={loading} className={authBtn}>
            {loading ? t('auth.updating') : t('auth.updatePassword')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
