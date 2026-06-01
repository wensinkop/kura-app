import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'

function SectionTitle({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wide text-faint mt-5 mb-2 px-1 first:mt-0">
      {children}
    </div>
  )
}

function Group({ children }) {
  return <div className="bg-surface border border-border rounded-[14px] overflow-hidden">{children}</div>
}

function Row({ title, sub, right, onClick, disabled }) {
  const Comp = onClick && !disabled ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`w-full flex gap-3 items-center px-3.5 py-3 border-t border-border first:border-t-0 text-left ${
        onClick && !disabled ? 'hover:bg-surface-2' : ''
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[14.5px] text-text">{title}</div>
        {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
      </div>
      {right}
    </Comp>
  )
}

function Switch({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative w-[46px] h-[27px] rounded-full shrink-0 transition-colors ${on ? 'bg-primary' : 'bg-border'}`}
    >
      <span className={`absolute top-[3px] w-[21px] h-[21px] rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-[3px]'}`} />
    </button>
  )
}

const Soon = <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Soon</span>
const Chevron = <span className="text-faint">›</span>

export default function Settings() {
  const { user, profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  return (
    <div className="max-w-[640px] mx-auto">
      <SectionTitle>Account</SectionTitle>
      <Group>
        <Row title={profile?.full_name || 'Your name'} sub={user?.email} />
        <Row title="Email & password" sub="Edit your sign-in details" right={Soon} disabled />
      </Group>

      <SectionTitle>Appearance</SectionTitle>
      <Group>
        <Row
          title="Dark mode"
          sub="Switch between light and dark"
          right={<Switch on={theme === 'dark'} onClick={toggleTheme} />}
        />
      </Group>

      <SectionTitle>Preferences</SectionTitle>
      <Group>
        <Row
          title="Base currency"
          sub="Used for combined totals across currencies"
          right={<span className="text-faint font-semibold">{profile?.base_currency ?? 'IDR'}</span>}
        />
      </Group>

      <SectionTitle>Structure</SectionTitle>
      <Group>
        <Row title="Categories" sub="Income & expense, sub-categories" right={Chevron} onClick={() => navigate('/settings/categories')} />
        <Row title="Accounts & groups" sub="Create, edit, group your accounts" right={Chevron} onClick={() => navigate('/settings/accounts')} />
      </Group>

      <SectionTitle>Data</SectionTitle>
      <Group>
        <Row title="Export / Import" sub="CSV / Excel · import never deletes" right={Soon} disabled />
        <Row title="Bank statement upload" sub="PDF / CSV → pre-filled rows · Premium" right={Soon} disabled />
        <Row title="Back up / Reset" sub="Full · keep structure · per-account" right={Soon} disabled />
      </Group>

      <div className="mt-5">
        <Group>
          <Row title="Sign out" onClick={signOut} right={Chevron} />
        </Group>
      </div>

      <p className="text-center text-xs text-faint py-6">Kura · steady, patient, protected 🐢</p>
    </div>
  )
}
