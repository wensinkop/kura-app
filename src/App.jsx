import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { ThemeProvider } from './ThemeContext'
import { LanguageProvider } from './LanguageContext'
import { MonthProvider } from './MonthContext'
import { FilterProvider } from './FilterContext'
import AppShell from './components/AppShell'
import NativeBackButton from './components/NativeBackButton'
import SignUp from './pages/SignUp'
import SignIn from './pages/SignIn'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ForgotEmail from './pages/ForgotEmail'
import Home from './pages/Home'
import Stats from './pages/Stats'
import Budget from './pages/Budget'
import Goals from './pages/Goals'
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
import Migrate from './pages/Migrate'
import AccountDetail from './pages/AccountDetail'
import Onboarding from './pages/Onboarding'
import Admin from './pages/Admin'
import AdminContent from './pages/AdminContent'
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

// Signed-in AND past first-run onboarding. New sign-ups (onboarded=false) are
// sent to /welcome until they finish or skip. A null profile (fetch error) is
// treated as onboarded so a hiccup never traps the user out of the app.
function AppRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/signin" replace />
  if (profile && !profile.onboarded) return <Navigate to="/welcome" replace />
  return children
}

// The onboarding screen: signed-in only, and skipped (→ home) once onboarded.
function WelcomeRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/signin" replace />
  if (profile?.onboarded) return <Navigate to="/" replace />
  return children
}

function AdminRoute({ children }) {
  const { role, loading } = useAuth()
  if (loading) return <Loading />
  if (role !== 'admin') return <Navigate to="/" replace />
  return children
}

// Budget is opt-in (Settings → Preferences). Off by default → route redirects home.
function BudgetRoute({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!profile?.budgets_enabled) return <Navigate to="/" replace />
  return children
}

// Goals is opt-in too (Settings → Preferences). Off by default → redirects home.
function GoalsRoute({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!profile?.goals_enabled) return <Navigate to="/" replace />
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
      <NativeBackButton />
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
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

            {/* First-run onboarding (signed-in, before setup is done) */}
            <Route path="/welcome" element={<WelcomeRoute><Onboarding /></WelcomeRoute>} />

            {/* App (signed-in + onboarded) — shared responsive shell */}
            <Route element={<AppRoute><AppShell /></AppRoute>}>
              <Route path="/" element={<Home />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/budget" element={<BudgetRoute><Budget /></BudgetRoute>} />
              <Route path="/goals" element={<GoalsRoute><Goals /></GoalsRoute>} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/categories" element={<SettingsCategories />} />
              <Route path="/settings/accounts" element={<SettingsAccounts />} />
              <Route path="/settings/rates" element={<SettingsRates />} />
              <Route path="/settings/data" element={<SettingsData />} />
              <Route path="/settings/account" element={<SettingsAccount />} />
            </Route>

            {/* Full-screen entry (signed-in + onboarded, outside the shell) */}
            <Route path="/new" element={<AppRoute><NewTransaction /></AppRoute>} />
            <Route path="/tx/:id" element={<AppRoute><EditTransaction /></AppRoute>} />
            <Route path="/search" element={<AppRoute><Search /></AppRoute>} />
            <Route
              path="/import/statement"
              element={
                <AppRoute>
                  <PremiumGate
                    feature="Bank statement upload"
                    tagline="A Premium feature"
                    perks={[
                      'Turn a PDF or CSV statement into ready-to-review Smara rows',
                      'Password-protected and multi-currency statements',
                      'Auto totals check so nothing is missed',
                      'Smara learns each bank’s layout and remembers it',
                    ]}
                  >
                    <BankStatement />
                  </PremiumGate>
                </AppRoute>
              }
            />
            {/* Migration from another app — free; lowers the switching barrier */}
            <Route path="/import/migrate" element={<AppRoute><Migrate /></AppRoute>} />
            <Route path="/accounts/:id" element={<AppRoute><AccountDetail /></AppRoute>} />
            <Route path="/admin" element={<AppRoute><AdminRoute><Admin /></AdminRoute></AppRoute>} />
            <Route path="/admin/content" element={<AppRoute><AdminRoute><AdminContent /></AdminRoute></AppRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </FilterProvider>
          </MonthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
