// Shared layout for the public, signed-out-reachable document pages (Privacy
// Policy, Terms, Help/FAQ). Deliberately standalone — it does NOT live inside
// AppShell or depend on auth, so the same URL works whether the visitor is
// signed in, signed out, or arriving cold from the Play Store listing. On-brand
// tokens follow the active theme (ThemeProvider wraps all routes).

import { useLayoutEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from '../lib/icons'

// ---- Prose primitives -----------------------------------------------------
// Small styled building blocks so each document reads as plain structured JSX
// while staying visually consistent. Headings, paragraphs, lists, emphasis.

export function H2({ children }) {
  return <h2 className="text-[17px] font-extrabold text-text mt-8 mb-2.5">{children}</h2>
}
export function P({ children }) {
  return <p className="text-[14.5px] text-muted leading-relaxed mb-3">{children}</p>
}
export function UL({ children }) {
  return <ul className="mb-3 space-y-1.5">{children}</ul>
}
export function LI({ children }) {
  return (
    <li className="flex gap-2.5 text-[14.5px] text-muted leading-relaxed">
      <span className="text-primary mt-0.5 shrink-0">•</span>
      <span>{children}</span>
    </li>
  )
}
export function Strong({ children }) {
  return <span className="font-semibold text-text">{children}</span>
}
export function A({ href, children }) {
  return <a href={href} className="text-primary font-semibold hover:underline">{children}</a>
}

// Cross-links shown at the foot of every legal/support page.
function DocFooter() {
  return (
    <div className="mt-10 pt-5 border-t border-border">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold">
        <Link to="/help" className="text-muted hover:text-primary">Help &amp; FAQ</Link>
        <Link to="/legal/privacy" className="text-muted hover:text-primary">Privacy Policy</Link>
        <Link to="/legal/terms" className="text-muted hover:text-primary">Terms &amp; Conditions</Link>
      </div>
      <p className="text-center text-xs text-faint py-6">Kura · steady, patient, protected 🐢</p>
    </div>
  )
}

export default function LegalDoc({ title, updated, children }) {
  const navigate = useNavigate()

  // These are standalone routes (outside AppShell, which handles its own scroll
  // restoration), so nothing resets the scroll when you arrive — open at the top.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [title])
  // React Router records a history index in window.history.state.idx. If we got
  // here by navigation (idx > 0) go back where the visitor came from; if the
  // page was opened cold (a shared/store link, idx 0) fall back to the home.
  const goBack = () => {
    const idx = window.history.state?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="sticky top-0 z-20 bg-surface border-b border-border px-4 h-[52px] flex items-center gap-2.5">
        <button
          onClick={goBack}
          aria-label="Back"
          className="w-9 h-9 -ml-1.5 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2 shrink-0"
        >
          <ChevronLeft />
        </button>
        <div className="font-extrabold text-[17px] truncate flex-1">{title}</div>
        <Link to="/" className="font-extrabold text-[17px] tracking-[-.3px] shrink-0">
          Kura<span className="text-primary">·</span>
        </Link>
      </header>

      <main className="max-w-[720px] mx-auto px-4 py-7">
        <h1 className="text-[24px] font-extrabold text-text">{title}</h1>
        {updated && <p className="text-[13px] text-faint mt-1.5">Last updated {updated}</p>}
        <div className="mt-5">{children}</div>
        <DocFooter />
      </main>
    </div>
  )
}
