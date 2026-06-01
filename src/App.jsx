import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { ThemeProvider } from './ThemeContext'
import AppShell from './components/AppShell'
import SignUp from './pages/SignUp'
import SignIn from './pages/SignIn'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ForgotEmail from './pages/ForgotEmail'
import Home from './pages/Home'
import Stats from './pages/Stats'
import Accounts from './pages/Accounts'
import Settings from './pages/Settings'
import SettingsCategories from './pages/SettingsCategories'
import SettingsAccounts from './pages/SettingsAccounts'
import NewTransaction from './pages/NewTransaction'

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <p className="text-muted">Loading…</p>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/signin" replace />
  return children
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Routes>
            {/* Auth (signed-out only) */}
            <Route path="/signup" element={<PublicOnlyRoute><SignUp /></PublicOnlyRoute>} />
            <Route path="/signin" element={<PublicOnlyRoute><SignIn /></PublicOnlyRoute>} />
            <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
            <Route path="/forgot-email" element={<PublicOnlyRoute><ForgotEmail /></PublicOnlyRoute>} />
            {/* Reachable via email recovery link — no guard (recovery creates a session) */}
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* App (signed-in) — shared responsive shell */}
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/" element={<Home />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/categories" element={<SettingsCategories />} />
              <Route path="/settings/accounts" element={<SettingsAccounts />} />
            </Route>

            {/* Full-screen entry (signed-in, outside the shell) */}
            <Route path="/new" element={<ProtectedRoute><NewTransaction /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
