import { Link } from 'react-router-dom'

// Centered card used by every auth screen (sign in / up / recovery).
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-4 pt-[calc(2.5rem_+_env(safe-area-inset-top))] pb-[calc(2.5rem_+_env(safe-area-inset-bottom))]">
      <Link to="/" className="font-extrabold text-2xl tracking-[-.3px] mb-6">
        Kura<span className="text-primary">·</span>
      </Link>
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-sm p-7">
        <h1 className="text-xl font-extrabold text-text">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1.5 mb-5">{subtitle}</p>}
        {!subtitle && <div className="mb-5" />}
        {children}
      </div>
      {footer && <div className="text-sm text-muted mt-5 text-center">{footer}</div>}
    </div>
  )
}

// Shared field styling for auth inputs.
export const authInput =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-text ' +
  'placeholder:text-faint focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'

export const authLabel = 'block text-sm font-medium text-muted mb-1'

export const authBtn =
  'w-full bg-primary text-on-primary font-bold py-2.5 rounded-xl hover:bg-primary-press ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export function AuthError({ children }) {
  if (!children) return null
  return (
    <div className="text-sm text-expense bg-expense/10 border border-expense/30 rounded-xl p-3">
      {children}
    </div>
  )
}

export function AuthNotice({ children }) {
  if (!children) return null
  return (
    <div className="text-sm text-primary bg-primary-soft border border-primary/30 rounded-xl p-3">
      {children}
    </div>
  )
}
