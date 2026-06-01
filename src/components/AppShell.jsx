import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import {
  HomeIcon, StatsIcon, AccountsIcon, SettingsIcon,
  PlusIcon, SearchIcon, FilterIcon, ChevronLeft, ChevronRight,
} from '../lib/icons'

const NAV = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/stats', label: 'Stats', Icon: StatsIcon },
  { to: '/accounts', label: 'Accounts', Icon: AccountsIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function titleFor(pathname) {
  if (pathname === '/') return 'Home'
  if (pathname.startsWith('/stats')) return 'Statistics'
  if (pathname.startsWith('/accounts')) return 'Accounts'
  if (pathname === '/settings/categories') return 'Categories'
  if (pathname === '/settings/accounts') return 'Accounts & groups'
  if (pathname.startsWith('/settings')) return 'Settings'
  return 'Kura'
}

// Settings sub-pages get a back arrow that returns to the Settings index.
function backTargetFor(pathname) {
  if (pathname.startsWith('/settings/')) return '/settings'
  return null
}

// MonthNav is cosmetic in Chunk 0 (no data wired yet); it establishes the
// approved top-bar control. Real month-scoped data lands in Chunk 2.
function MonthNav() {
  const now = new Date()
  const [mi, setMi] = useState(now.getMonth())
  const [yr, setYr] = useState(now.getFullYear())
  function shift(d) {
    let m = mi + d, y = yr
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMi(m); setYr(y)
  }
  return (
    <div className="flex items-center gap-1 flex-1 justify-center desk:flex-initial">
      <button onClick={() => shift(-1)} aria-label="Previous month"
        className="w-[34px] h-[34px] rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
        <ChevronLeft />
      </button>
      <span className="font-bold text-base px-3 py-1.5 rounded-[10px]">{MONTHS[mi]} {yr}</span>
      <button onClick={() => shift(1)} aria-label="Next month"
        className="w-[34px] h-[34px] rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
        <ChevronRight />
      </button>
    </div>
  )
}

export default function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const isHome = pathname === '/'
  const title = titleFor(pathname)
  const backTarget = backTargetFor(pathname)

  const sidebarLink = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-[10px] font-semibold text-[14.5px] mb-0.5 ` +
    (isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2')

  const bottomLink = ({ isActive }) =>
    `flex flex-col items-center gap-[3px] text-[10.5px] font-semibold py-1 ` +
    (isActive ? 'text-primary' : 'text-faint')

  return (
    <div className="flex min-h-screen">
      {/* ===== Desktop sidebar (≥ --breakpoint-desk) ===== */}
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

      {/* ===== Main column ===== */}
      <div className="flex-1 w-full max-w-[520px] mx-auto desk:max-w-none flex flex-col min-h-screen bg-bg">
        <header className="sticky top-0 z-20 bg-surface desk:bg-transparent border-b border-border desk:border-0 px-4 py-3 desk:px-8 desk:pt-2 desk:pb-4 flex items-center gap-2.5 w-full desk:max-w-[1120px] desk:mx-auto">
          {isHome ? (
            <div className="font-extrabold text-[18px] tracking-[-.3px] desk:hidden">
              Kura<span className="text-primary">·</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {backTarget && (
                <button onClick={() => navigate(backTarget)} aria-label="Back"
                  className="w-9 h-9 -ml-1.5 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2 shrink-0">
                  <ChevronLeft />
                </button>
              )}
              <div className="font-extrabold text-xl truncate">{title}</div>
            </div>
          )}

          {isHome && <MonthNav />}

          {isHome && (
            <>
              <button title="Search (coming in a later chunk)" aria-label="Search"
                className="w-[38px] h-[38px] rounded-[11px] grid place-items-center text-muted hover:bg-surface-2">
                <SearchIcon />
              </button>
              <button title="Filter (coming in a later chunk)" aria-label="Filter"
                className="w-[38px] h-[38px] rounded-[11px] grid place-items-center text-muted hover:bg-surface-2">
                <FilterIcon />
              </button>
            </>
          )}
        </header>

        <main className="flex-1 px-4 pb-24 pt-4 desk:px-8 desk:pb-10 desk:pt-0 w-full desk:max-w-[1120px] desk:mx-auto">
          <Outlet />
        </main>

        {/* ===== Mobile bottom nav + center FAB (< --breakpoint-desk) ===== */}
        <nav className="desk:hidden sticky bottom-0 z-20 bg-surface border-t border-border grid grid-cols-5 items-center px-1.5 py-2">
          <NavLink to="/" end className={bottomLink}>
            <HomeIcon className="w-[18px] h-[18px]" />Home
          </NavLink>
          <NavLink to="/stats" className={bottomLink}>
            <StatsIcon className="w-[18px] h-[18px]" />Stats
          </NavLink>
          <button onClick={() => navigate('/new')} aria-label="New transaction"
            className="w-[54px] h-[54px] rounded-full bg-primary text-on-primary grid place-items-center justify-self-center -mt-[26px] shadow-[0_6px_16px_rgba(4,120,87,.4)]">
            <PlusIcon className="w-[26px] h-[26px]" />
          </button>
          <NavLink to="/accounts" className={bottomLink}>
            <AccountsIcon className="w-[18px] h-[18px]" />Accounts
          </NavLink>
          <NavLink to="/settings" className={bottomLink}>
            <SettingsIcon className="w-[18px] h-[18px]" />Settings
          </NavLink>
        </nav>
      </div>
    </div>
  )
}
