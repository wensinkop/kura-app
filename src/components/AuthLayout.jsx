import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import Logo from './Logo'
import { EyeIcon, EyeOffIcon } from '../lib/icons'

// Centered card used by every auth screen (sign in / up / recovery).
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-4 pt-[calc(2.5rem_+_env(safe-area-inset-top))] pb-[calc(2.5rem_+_env(safe-area-inset-bottom))]">
      <Link to="/" className="mb-6">
        <Logo markClassName="w-9 h-9" textClassName="text-2xl" />
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

// Password field with a show/hide toggle. Typing a password blind on mobile is
// error-prone; the eye lets the user verify it. `aria-label` localised.
export function PasswordInput({ value, onChange, placeholder, autoComplete, required, id }) {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={`${authInput} pr-11`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-muted hover:text-primary"
      >
        {show ? <EyeOffIcon className="w-[18px] h-[18px]" /> : <EyeIcon className="w-[18px] h-[18px]" />}
      </button>
    </div>
  )
}
