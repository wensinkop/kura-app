import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { cacheClear } from './lib/cache'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Current session on first load.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // React to login / logout / token refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      setProfile(null)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  // Patch the current user's profile row and keep local state in sync.
  async function updateProfile(patch) {
    if (!session?.user) return { error: new Error('Not signed in') }
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', session.user.id)
      .select()
      .single()
    if (!error && data) setProfile(data)
    return { data, error }
  }

  // scope 'local' (default) signs out just this device; 'global' signs out
  // everywhere (all devices); 'others' keeps this device and revokes the rest.
  async function signOut(scope = 'local') {
    cacheClear() // don't leak one user's cached lists into the next session
    await supabase.auth.signOut({ scope })
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    updateProfile,
    refreshProfile: () => session?.user && fetchProfile(session.user.id),
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useAuth() {
  return useContext(AuthContext)
}
