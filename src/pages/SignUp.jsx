import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError, AuthNotice, PasswordInput } from '../components/AuthLayout'
import { friendlyAuthError } from '../lib/authErrors'

export default function SignUp() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [phase, setPhase] = useState('form') // 'form' | 'otp'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  // Arrived from sign-in for an unverified account ("Finish verifying"): jump
  // straight to the code step and send a fresh code (the abandoned one may have
  // expired). Runs once on mount.
  useEffect(() => {
    const ve = location.state?.verifyEmail
    if (!ve) return
    // Deferred so setState isn't called synchronously in the effect body.
    const id = setTimeout(() => {
      setEmail(ve)
      setPhase('otp')
      setNotice(t('auth.sentCode', { email: ve }))
      supabase.auth.resend({ type: 'signup', email: ve })
    }, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function validate() {
    if (name.trim().length < 2) return t('auth.errName')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('auth.errEmail')
    if (password.length < 6) return t('auth.errPwMin')
    if (password !== confirm) return t('auth.errPwMismatch')
    return null
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    const v = validate()
    if (v) { setError(v); return }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    })
    setLoading(false)

    if (error) { setError(friendlyAuthError(error, t)); return }

    // If email confirmation is disabled, Supabase returns a live session — go in.
    if (data.session) { navigate('/'); return }

    // Otherwise a 6-digit code was emailed; collect it.
    setNotice(t('auth.sentCode', { email }))
    setPhase('otp')
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6,8}$/.test(code.trim())) { setError(t('auth.errCode')); return }

    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'signup',
    })
    setLoading(false)

    if (error) { setError(friendlyAuthError(error, t)); return }
    navigate('/') // onAuthStateChange picks up the new session
  }

  async function handleResend() {
    setError(''); setNotice('')
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) setError(friendlyAuthError(error, t))
    else setNotice(t('auth.newCodeSent', { email }))
  }

  if (phase === 'otp') {
    return (
      <AuthLayout
        title={t('auth.verifyTitle')}
        subtitle={t('auth.verifySubtitle')}
        footer={
          <button onClick={() => { setPhase('form'); setError(''); setNotice('') }} className="text-primary hover:underline">
            {t('auth.useDifferentEmail')}
          </button>
        }
      >
        <form onSubmit={handleVerify} className="space-y-4">
          <AuthNotice>{notice}</AuthNotice>
          <div>
            <label className={authLabel}>{t('auth.code6')}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="12345678"
              className={`${authInput} tracking-[0.5em] text-center text-lg font-bold`}
              required
            />
          </div>
          <AuthError>{error}</AuthError>
          <button type="submit" disabled={loading} className={authBtn}>
            {loading ? t('auth.verifying') : t('auth.verifyContinue')}
          </button>
          <button type="button" onClick={handleResend} className="w-full text-sm text-muted hover:text-primary">
            {t('auth.resendPrompt')}
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.createAccountTitle')}
      subtitle={t('auth.createSubtitle')}
      footer={<>{t('auth.haveAccount')} <Link to="/signin" className="text-primary hover:underline">{t('auth.signIn')}</Link></>}
    >
      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <label className={authLabel}>{t('auth.name')}</label>
          <input value={name} autoComplete="name" autoFocus onChange={(e) => setName(e.target.value)} className={authInput} placeholder={t('auth.namePlaceholder')} required />
        </div>
        <div>
          <label className={authLabel}>{t('auth.email')}</label>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} required />
        </div>
        <div>
          <label className={authLabel}>{t('auth.password')}</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" required />
          <p className="text-xs text-faint mt-1 pl-0.5">{t('auth.passwordRule')}</p>
        </div>
        <div>
          <label className={authLabel}>{t('auth.confirmPassword')}</label>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </div>
        <AuthError>{error}</AuthError>
        <button type="submit" disabled={loading} className={authBtn}>
          {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
        </button>
        <p className="text-xs text-muted text-center leading-relaxed">
          {t('auth.agreePre')}{' '}
          <Link to="/legal/terms" className="text-primary hover:underline">{t('auth.termsWord')}</Link> {t('auth.and')}{' '}
          <Link to="/legal/privacy" className="text-primary hover:underline">{t('auth.privacyWord')}</Link>.
        </p>
      </form>
    </AuthLayout>
  )
}
