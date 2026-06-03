import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { ThemeProvider } from './ThemeContext'
import { MonthProvider } from './MonthContext'
import { FilterProvider } from './FilterContext'
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
import SettingsRates from './pages/SettingsRates'
import SettingsData from './pages/SettingsData'
import SettingsAccount from './pages/SettingsAccount'
import NewTransaction from './pages/NewTransaction'
import EditTransaction from './pages/EditTransaction'
import Search from './pages/Search'
import BankStatement from './pages/BankStatement'
import AccountDetail from './pages/AccountDetail'
import Admin from './pages/Admin'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Terms from './pages/Terms'
import Help from './pages/Help'
import PremiumGate from './components/PremiumGate'

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

function AdminRoute({ children }) {
  const { role, loading } = useAuth()
  if (loading) return <Loading />
  if (role !== 'admin') return <Navigate to="/" replace />
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
          <MonthProvider>
          <FilterProvider>
          <Routes>
            {/* Auth (signed-out only) */}
            <Route path="/signup" element={<PublicOnlyRoute><SignUp /></PublicOnlyRoute>} />
            <Route path="/signin" element={<PublicOnlyRoute><SignIn /></PublicOnlyRoute>} />
            <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
            <Route path="/forgot-email" element={<PublicOnlyRoute><ForgotEmail /></PublicOnlyRoute>} />
            {/* Reachable via email recovery link — no guard (recovery creates a session) */}
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Legal & support — public, reachable signed-in or signed-out (also linkable for the Play Store listing) */}
            <Route path="/legal/privacy" element={<PrivacyPolicy />} />
            <Route path="/legal/terms" element={<Terms />} />
            <Route path="/help" element={<Help />} />

            {/* App (signed-in) — shared responsive shell */}
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/" element={<Home />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/categories" element={<SettingsCategories />} />
              <Route path="/settings/accounts" element={<SettingsAccounts />} />
              <Route path="/settings/rates" element={<SettingsRates />} />
              <Route path="/settings/data" element={<SettingsData />} />
              <Route path="/settings/account" element={<SettingsAccount />} />
            </Route>

            {/* Full-screen entry (signed-in, outside the shell) */}
            <Route path="/new" element={<ProtectedRoute><NewTransaction /></ProtectedRoute>} />
            <Route path="/tx/:id" element={<ProtectedRoute><EditTransaction /></ProtectedRoute>} />
            <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
            <Route
              path="/import/statement"
              element={
                <ProtectedRoute>
                  <PremiumGate
                    feature="Bank statement upload"
                    tagline="A Premium feature"
                    perks={[
                      'Turn a PDF or CSV statement into ready-to-review Kura rows',
                      'Password-protected and multi-currency statements',
                      'Auto totals check so nothing is missed',
                      'Kura learns each bank’s layout and remembers it',
                    ]}
                  >
                    <BankStatement />
                  </PremiumGate>
                </ProtectedRoute>
              }
            />
            <Route path="/accounts/:id" element={<ProtectedRoute><AccountDetail /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminRoute><Admin /></AdminRoute></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </FilterProvider>
          </MonthProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
