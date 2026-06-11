import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMonth } from '../MonthContext'
import { monthYearLabel } from '../lib/format'
import { useAccountFilter } from '../FilterContext'
import Sidebar from './Sidebar'
import AccountFilterSheet from './AccountFilterSheet'
import { BrandMark } from './Logo'
import {
  HomeIcon, StatsIcon, AccountsIcon, SettingsIcon,
  PlusIcon, SearchIcon, FilterIcon, ChevronLeft, ChevronRight,
} from '../lib/icons'

// Returns the i18n key for the page title; resolved with t() at render.
function titleKeyFor(pathname) {
  if (pathname === '/') return 'title.home'
  if (pathname.startsWith('/stats')) return 'title.statistics'
  if (pathname === '/budget') return 'title.budget'
  if (pathname === '/goals') return 'title.goals'
  if (pathname.startsWith('/accounts')) return 'title.accounts'
  if (pathname === '/settings/categories') return 'title.categories'
  if (pathname === '/settings/accounts') return 'title.accountsGroups'
  if (pathname === '/settings/rates') return 'title.exchangeRates'
  if (pathname === '/settings/data') return 'title.backupData'
  if (pathname === '/settings/account') return 'title.emailPassword'
  if (pathname.startsWith('/settings')) return 'title.settings'
  return 'title.smara'
}

// Settings sub-pages get a back arrow that returns to the Settings index.
function backTargetFor(pathname) {
  if (pathname.startsWith('/settings/')) return '/settings'
  if (pathname === '/budget') return '/' // reached from the Home card / Settings, not the bottom nav
  if (pathname === '/goals') return '/accounts' // lives under Accounts (+ a Home card)
  return null
}

// Remembered scroll offset per top-level path, so leaving Home/Stats and coming
// back lands where you left off. Module-level so it survives AppShell remounts
// (e.g. after a detour through the full-screen /new screen). Drill-in sub-pages
// (/settings/*) always open at the top instead — see the effect below.
const scrollMemory = {}
const restoresScroll = (pathname) => !pathname.startsWith('/settings/')

// Selected-month control in the Home top bar; reads/writes the shared MonthContext.
function MonthNav() {
  const { t } = useTranslation()
  const { year, monthIndex, prev, next, today, isCurrent } = useMonth()
  const label = monthYearLabel(year, monthIndex)
  return (
    <div className="flex items-center gap-1 flex-1 justify-center desk:flex-initial">
      <button onClick={prev} aria-label={t('month.previous')}
        className="w-[34px] h-[34px] rounded-[10px] grid place-items-center text-muted hover:bg-surface-2 shrink-0">
        <ChevronLeft />
      </button>
      {/* When viewing another month the label turns into a tappable chip that
          jumps back to today — keeps the affordance without widening the row on
          narrow phones (a long month + the search/filter icons already fill it). */}
      <button
        onClick={isCurrent ? undefined : today}
        disabled={isCurrent}
        aria-label={isCurrent ? undefined : t('month.backToThis')}
        title={isCurrent ? undefined : t('month.backToThis')}
        className={`font-bold text-base px-2.5 py-1.5 rounded-full whitespace-nowrap transition-colors ${
          isCurrent ? 'cursor-default' : 'text-primary bg-primary-soft hover:brightness-95'
        }`}
      >
        {label}
      </button>
      <button onClick={next} aria-label={t('month.next')}
        className="w-[34px] h-[34px] rounded-[10px] grid place-items-center text-muted hover:bg-surface-2 shrink-0">
        <ChevronRight />
      </button>
    </div>
  )
}

export default function AppShell() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isFiltered } = useAccountFilter()
  const [filterOpen, setFilterOpen] = useState(false)
  const isHome = pathname === '/'

  // Scroll handling on navigation. Top-level tabs (Home/Stats/Accounts/Settings)
  // restore where you left off; drill-in sub-pages (/settings/*) open at the top.
  // We record the offset continuously *while scrolling* (not at unmount) — the
  // browser clamps scroll to 0 the instant a shorter page mounts, so reading it
  // late captures 0. Restore retries until ~1.5s because the page (e.g. the Home
  // list) may still be loading and too short to scroll onto when it first mounts.
  useLayoutEffect(() => {
    const path = pathname
    const track = restoresScroll(path)
    let frame = 0

    if (track && scrollMemory[path]) {
      const target = scrollMemory[path]
      const start = Date.now()
      const restore = () => {
        window.scrollTo(0, target)
        if (window.scrollY < target - 1 && Date.now() - start < 1500) frame = requestAnimationFrame(restore)
      }
      frame = requestAnimationFrame(restore)
    } else {
      window.scrollTo(0, 0)
    }

    if (!track) return () => cancelAnimationFrame(frame)

    const onScroll = () => { scrollMemory[path] = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [pathname])

  const title = t(titleKeyFor(pathname))
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
          {/* On headerless tabs (Stats/Accounts/Settings) nothing covers the
              status bar, so a thin bar painted in the page background keeps the
              clock/battery legible over scrolling content. Height is the device
              safe-area inset → 0 (invisible) on web and desktop. */}
          {!showHeader && (
            <div className="desk:hidden fixed top-0 inset-x-0 z-30 bg-bg pointer-events-none h-[env(safe-area-inset-top)]" />
          )}
          {showHeader && (
            <header className="sticky top-0 z-20 bg-surface desk:bg-transparent border-b border-border desk:border-0 px-4 desk:px-8 pt-[calc(0.75rem_+_env(safe-area-inset-top))] pb-3 desk:pt-2 desk:pb-4 flex items-center gap-2.5 w-full desk:max-w-[1120px] desk:mx-auto">
              {isHome ? (
                <BrandMark className="w-7 h-7 shrink-0 desk:hidden" />
              ) : (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {backTarget && (
                    <button onClick={() => navigate(backTarget)} aria-label={t('common.back')}
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
                  <button onClick={() => navigate('/search')} title={t('nav.search')} aria-label={t('nav.search')}
                    className="w-[38px] h-[38px] rounded-[11px] grid place-items-center text-muted hover:bg-surface-2">
                    <SearchIcon />
                  </button>
                  <button onClick={() => setFilterOpen(true)} title={t('nav.filter')} aria-label={t('nav.filter')}
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

          <main className={`flex-1 overflow-x-clip px-4 pb-24 w-full desk:max-w-[1120px] desk:mx-auto desk:px-8 desk:pb-10 ${showHeader ? 'pt-4 desk:pt-0' : 'pt-[calc(1.25rem_+_env(safe-area-inset-top))] desk:pt-6'}`}>
            <Outlet />
          </main>

          {/* ===== Mobile bottom nav + center FAB (< --breakpoint-desk) =====
              data-hide-on-keyboard: hidden on native while the soft keyboard is
              open (e.g. changing email/password in Settings) so it doesn't float
              above the keyboard. */}
          <nav data-hide-on-keyboard className="desk:hidden sticky bottom-0 z-20 bg-surface border-t border-border grid grid-cols-5 items-center px-1.5 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
            <NavLink to="/" end className={bottomLink}>
              <HomeIcon className="w-[18px] h-[18px]" />{t('nav.home')}
            </NavLink>
            <NavLink to="/stats" className={bottomLink}>
              <StatsIcon className="w-[18px] h-[18px]" />{t('nav.stats')}
            </NavLink>
            <button onClick={() => navigate('/new')} aria-label={t('nav.newTransaction')}
              className="w-[54px] h-[54px] rounded-full bg-primary text-on-primary grid place-items-center justify-self-center -mt-[26px] shadow-[0_6px_16px_rgba(4,120,87,.4)]">
              <PlusIcon className="w-[26px] h-[26px]" />
            </button>
            <NavLink to="/accounts" className={bottomLink}>
              <AccountsIcon className="w-[18px] h-[18px]" />{t('nav.accounts')}
            </NavLink>
            <NavLink to="/settings" className={bottomLink}>
              <SettingsIcon className="w-[18px] h-[18px]" />{t('nav.settings')}
            </NavLink>
          </nav>
        </div>

        {filterOpen && <AccountFilterSheet onClose={() => setFilterOpen(false)} />}
      </div>
  )
}
