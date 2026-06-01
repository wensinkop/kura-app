import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { HomeIcon, StatsIcon, AccountsIcon, SettingsIcon, PlusIcon } from '../lib/icons'

const NAV = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/stats', label: 'Stats', Icon: StatsIcon },
  { to: '/accounts', label: 'Accounts', Icon: AccountsIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

// Desktop-only left sidebar (hidden below --breakpoint-desk). Shared by the
// AppShell and the full-page New Transaction screen so the nav persists beside
// the entry register on desktop (matches the locked mockup).
export default function Sidebar() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const sidebarLink = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-[10px] font-semibold text-[14.5px] mb-0.5 ` +
    (isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2')

  return (
    <aside className="hidden desk:flex flex-col w-[248px] shrink-0 bg-surface border-r border-border px-3.5 py-[18px] sticky top-0 h-screen">
      <div className="font-extrabold text-[21px] tracking-[-.3px] px-3 pt-1.5 pb-4">
        Kura<span className="text-primary">·</span>
      </div>
      <button onClick={() => navigate('/new')}
        className="flex items-center justify-center gap-2 bg-primary text-on-primary font-bold text-sm py-2.5 rounded-[11px] mb-3.5 hover:bg-primary-press">
        <PlusIcon className="w-[18px] h-[18px]" /> New transaction
      </button>
      {NAV.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={sidebarLink}>
          <Icon className="w-[18px] h-[18px]" /> {label}
        </NavLink>
      ))}
      <div className="mt-auto border-t border-border pt-3 text-xs text-faint break-all">
        {user?.email}
        <br />Base currency · {profile?.base_currency ?? 'IDR'}
      </div>
    </aside>
  )
}
