import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError, AuthNotice } from '../components/AuthLayout'

export default function SignUp() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('form') // 'form' | 'otp'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  function validate() {
    if (name.trim().length < 2) return 'Please enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email.'
    if (password.length < 6) return 'Password must be at least 6 characters.'
    if (password !== confirm) return 'Passwords do not match.'
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

    if (error) { setError(error.message); return }

    // If email confirmation is disabled, Supabase returns a live session — go in.
    if (data.session) { navigate('/'); return }

    // Otherwise a 6-digit code was emailed; collect it.
    setNotice(`We sent a 6-digit verification code to ${email}.`)
    setPhase('otp')
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code.trim())) { setError('Enter the 6-digit code from your email.'); return }

    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'signup',
    })
    setLoading(false)

    if (error) { setError(error.message); return }
    navigate('/') // onAuthStateChange picks up the new session
  }

  async function handleResend() {
    setError(''); setNotice('')
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) setError(error.message)
    else setNotice(`A new code was sent to ${email}.`)
  }

  if (phase === 'otp') {
    return (
      <AuthLayout
        title="Verify your email"
        subtitle="Enter the code we emailed you to finish creating your account."
        footer={
          <button onClick={() => { setPhase('form'); setError(''); setNotice('') }} className="text-primary hover:underline">
            ← Use a different email
          </button>
        }
      >
        <form onSubmit={handleVerify} className="space-y-4">
          <AuthNotice>{notice}</AuthNotice>
          <div>
            <label className={authLabel}>6-digit code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className={`${authInput} tracking-[0.5em] text-center text-lg font-bold`}
              required
            />
          </div>
          <AuthError>{error}</AuthError>
          <button type="submit" disabled={loading} className={authBtn}>
            {loading ? 'Verifying…' : 'Verify & continue'}
          </button>
          <button type="button" onClick={handleResend} className="w-full text-sm text-muted hover:text-primary">
            Didn’t get it? Resend code
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track income, expenses and transfers across all your accounts."
      footer={<>Already have an account? <Link to="/signin" className="text-primary hover:underline">Sign in</Link></>}
    >
      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <label className={authLabel}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={authInput} placeholder="Your name" required />
        </div>
        <div>
          <label className={authLabel}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} required />
        </div>
        <div>
          <label className={authLabel}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} placeholder="At least 6 characters" required />
        </div>
        <div>
          <label className={authLabel}>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authInput} required />
        </div>
        <AuthError>{error}</AuthError>
        <button type="submit" disabled={loading} className={authBtn}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-xs text-muted text-center leading-relaxed">
          By creating an account, you agree to our{' '}
          <Link to="/legal/terms" className="text-primary hover:underline">Terms</Link> and{' '}
          <Link to="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  )
}
