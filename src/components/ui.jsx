// Small shared UI kit for the Chunk 1 settings screens, styled to Smara tokens.
// Kept deliberately lightweight (no dependencies) — Modal, Button, Field,
// TextInput, Segmented, IconButton, ConfirmDialog.

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon } from '../lib/icons'

// Modal: full-screen dim backdrop. Mobile = bottom sheet; desktop = centered
// card. Closes on Esc and backdrop click. `footer` pins actions to the bottom.
export function Modal({ title, onClose, children, footer }) {
  const { t } = useTranslation()
  const panelRef = useRef(null)

  // Open/close only (runs once): lock background scroll, move focus into the
  // dialog, and restore focus to the trigger on close. Kept separate from the
  // keydown effect below so a re-render (e.g. typing in a field, which changes an
  // inline onClose prop) never re-runs this and steals focus from the input.
  useEffect(() => {
    const prevFocus = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Don't override a child's autofocus — only grab focus if nothing inside has it.
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      if (prevFocus instanceof HTMLElement) prevFocus.focus()
    }
  }, [])

  // Esc to close + Tab focus-trap. Re-binds when onClose changes; never moves focus.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end desk:items-center justify-center bg-black/45 p-0 desk:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className="bg-surface w-full desk:max-w-[460px] rounded-t-2xl desk:rounded-2xl border border-border shadow-lg max-h-[92dvh] flex flex-col outline-none"
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <div className="font-bold text-[16px] flex-1">{title}</div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-9 h-9 -mr-1.5 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2"
          >
            <CloseIcon className="w-[18px] h-[18px]" />
          </button>
        </div>
        <div className="px-4 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-border flex gap-2.5">{footer}</div>}
      </div>
    </div>
  )
}

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 font-bold text-sm rounded-[11px] px-4 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export function Button({ variant = 'primary', className = '', ...rest }) {
  const styles = {
    primary: 'bg-primary text-on-primary hover:bg-primary-press',
    ghost: 'border border-border text-muted hover:bg-surface-2',
    danger: 'bg-expense text-white hover:opacity-90',
  }
  return <button className={`${BTN_BASE} ${styles[variant]} ${className}`} {...rest} />
}

// Labeled form field wrapper.
export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold text-muted pl-0.5">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-faint pl-0.5">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text ' +
  'placeholder:text-faint focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

export function TextInput({ className = '', ...rest }) {
  return <input className={`${inputClass} ${className}`} {...rest} />
}

// Segmented control (e.g. Income / Expense tabs). options: [{value,label}].
export function Segmented({ value, onChange, options }) {
  return (
    <div className="flex bg-surface-2 border border-border rounded-xl p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 py-2 rounded-[9px] font-bold text-[13.5px] transition-colors ${
            value === o.value ? 'bg-surface text-primary shadow-sm' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Compact square icon button for inline row actions.
export function IconButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-[9px] grid place-items-center shrink-0 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent ${
        danger ? 'text-expense' : 'text-muted'
      }`}
    >
      {children}
    </button>
  )
}

// Confirmation dialog built on Modal. `tone='danger'` for destructive actions.
export function ConfirmDialog({ title, message, confirmLabel, tone = 'danger', onConfirm, onClose, busy }) {
  const { t } = useTranslation()
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? t('common.working') : (confirmLabel ?? t('common.confirm'))}
          </Button>
        </>
      }
    >
      <p className="text-[14px] text-muted leading-relaxed">{message}</p>
    </Modal>
  )
}
