import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMonth } from '../MonthContext'
import { useAccountFilter } from '../FilterContext'
import Sidebar from './Sidebar'
import AccountFilterSheet from './AccountFilterSheet'
import {
  HomeIcon, StatsIcon, AccountsIcon, SettingsIcon,
  PlusIcon, SearchIcon, FilterIcon, ChevronLeft, ChevronRight,
} from '../lib/icons'

function titleFor(pathname) {
  if (pathname === '/') return 'Home'
  if (pathname.startsWith('/stats')) return 'Statistics'
  if (pathname.startsWith('/accounts')) return 'Accounts'
  if (pathname === '/settings/categories') return 'Categories'
  if (pathname === '/settings/accounts') return 'Accounts & groups'
  if (pathname === '/settings/rates') return 'Exchange rates'
  if (pathname.startsWith('/settings')) return 'Settings'
  return 'Kura'
}

// Settings sub-pages get a back arrow that returns to the Settings index.
function backTargetFor(pathname) {
  if (pathname.startsWith('/settings/')) return '/settings'
  return null
}

// Selected-month control in the Home top bar; reads/writes the shared MonthContext.
function MonthNav() {
  const { label, prev, next } = useMonth()
  return (
    <div className="flex items-center gap-1 flex-1 justify-center desk:flex-initial">
      <button onClick={prev} aria-label="Previous month"
        className="w-[34px] h-[34px] rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
        <ChevronLeft />
      </button>
      <span className="font-bold text-base px-3 py-1.5 rounded-[10px]">{label}</span>
      <button onClick={next} aria-label="Next month"
        className="w-[34px] h-[34px] rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
        <ChevronRight />
      </button>
    </div>
  )
}

export default function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isFiltered } = useAccountFilter()
  const [filterOpen, setFilterOpen] = useState(false)
  const isHome = pathname === '/'
  const title = titleFor(pathname)
  const backTarget = backTargetFor(pathname)
  // The bottom nav / sidebar already names the top-level pages, so they show no
  // header. Home keeps its month/search/filter bar; settings sub-pages keep a
  // header for the back arrow.
  const showHeader = isHome || !!backTarget

  const bottomLink = ({ isActive }) =>
    `flex flex-col items-center gap-[3px] text-[10.5px] font-semibold py-1 ` +
    (isActive ? 'text-primary' : 'text-faint')

  return (
      <div className="flex min-h-screen">
        {/* ===== Desktop sidebar (≥ --breakpoint-desk) ===== */}
        <Sidebar />

        {/* ===== Main column ===== */}
        <div className="flex-1 w-full max-w-[520px] mx-auto desk:max-w-none flex flex-col min-h-screen bg-bg">
          {showHeader && (
            <header className="sticky top-0 z-20 bg-surface desk:bg-transparent border-b border-border desk:border-0 px-4 desk:px-8 h-[52px] desk:h-auto desk:pt-2 desk:pb-4 flex items-center gap-2.5 w-full desk:max-w-[1120px] desk:mx-auto">
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
                  <button onClick={() => navigate('/search')} title="Search" aria-label="Search"
                    className="w-[38px] h-[38px] rounded-[11px] grid place-items-center text-muted hover:bg-surface-2">
                    <SearchIcon />
                  </button>
                  <button onClick={() => setFilterOpen(true)} title="Filter by account" aria-label="Filter"
                    className={`relative w-[38px] h-[38px] rounded-[11px] grid place-items-center hover:bg-surface-2 ${
                      isFiltered ? 'text-primary bg-primary-soft' : 'text-muted'
                    }`}>
                    <FilterIcon />
                    {isFiltered && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary border-2 border-surface" />}
                  </button>
                </>
              )}
            </header>
          )}

          <main className={`flex-1 px-4 pb-24 w-full desk:max-w-[1120px] desk:mx-auto desk:px-8 desk:pb-10 ${showHeader ? 'pt-4 desk:pt-0' : 'pt-5 desk:pt-6'}`}>
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

        {filterOpen && <AccountFilterSheet onClose={() => setFilterOpen(false)} />}
      </div>
  )
}
