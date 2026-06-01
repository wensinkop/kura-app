import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AuthLayout, { authInput, authLabel, authBtn, AuthError } from '../components/AuthLayout'

export default function SignIn() {
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
    if (error) { setError(error.message); return }
    navigate('/')
  }

  return (
    <AuthLayout
      title="Welcome back"
      footer={<>No account yet? <Link to="/signup" className="text-primary hover:underline">Create one</Link></>}
    >
      <form onSubmit={handleSignIn} className="space-y-4">
        <div>
          <label className={authLabel}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} required />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-muted">Password</label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
          </div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} required />
        </div>
        <AuthError>{error}</AuthError>
        <button type="submit" disabled={loading} className={authBtn}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <Link to="/forgot-email" className="block w-full text-center text-sm text-muted hover:text-primary">
          Forgot which email you used?
        </Link>
      </form>
    </AuthLayout>
  )
}
