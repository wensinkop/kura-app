import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// Plain-text input with a typeahead dropdown. Ported from Gelato; restyled to
// Kura tokens. Suggestions are filtered case-insensitively by substring.
// - ↑/↓ navigate · Tab/Enter accept · Esc close · click/tap to accept
//
// Per the spec, suggestions appear from the 2nd typed character (minChars=2).
//
// Opt-in extras (used by the mobile bank-statement review flow):
// - multiline: render a textarea that auto-grows to fit its text (so a long note
//   is fully visible). In multiline mode Enter inserts a newline and is NOT used
//   to accept a suggestion (tap a suggestion instead) — there's no Tab key on
//   mobile, so the parent drives row-to-row navigation.
// - selectOnFocus: select all text on focus so typing replaces the note wholesale.
// - inputRef: callback ref receiving the underlying input/textarea node, so the
//   parent can focus()/blur() it as part of the keyboard-driven flow.
// - onFocus / onBlur: pass-throughs so the parent can track which note is active.
export default function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  maxItems = 8,
  minChars = 2,
  multiline = false,
  selectOnFocus = false,
  inputRef,
  onFocus,
  onBlur,
}) {
  const [open, setOpen] = useState(false)
  const [hoverIdx, setHoverIdx] = useState(0)
  const wrapperRef = useRef(null)
  const elRef = useRef(null)

  function setEl(el) {
    elRef.current = el
    if (typeof inputRef === 'function') inputRef(el)
  }

  const filtered = useMemo(() => {
    const q = (value ?? '').trim().toLowerCase()
    if (q.length < minChars) return []
    return (suggestions ?? [])
      .filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .slice(0, maxItems)
  }, [value, suggestions, maxItems, minChars])

  useEffect(() => {
    function onDocClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Auto-grow the textarea so the whole note is visible (multiline mode only).
  useLayoutEffect(() => {
    if (!multiline) return
    const el = elRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, multiline])

  function accept(idx) {
    const pick = filtered[idx]
    if (!pick) return
    onChange(pick)
    setOpen(false)
  }

  function handleKey(e) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setHoverIdx((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setHoverIdx((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (!multiline && (e.key === 'Tab' || e.key === 'Enter')) {
      e.preventDefault(); accept(hoverIdx)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function handleFocus(e) {
    setOpen(true)
    setHoverIdx(0)
    if (selectOnFocus) {
      const el = e.target
      // Defer so the selection sticks after the browser's own focus handling.
      requestAnimationFrame(() => { try { el.select() } catch { /* noop */ } })
    }
    onFocus?.(e)
  }

  const fieldProps = {
    ref: setEl,
    value,
    onChange: (e) => { onChange(e.target.value); setOpen(true); setHoverIdx(0) },
    onFocus: handleFocus,
    onBlur: (e) => onBlur?.(e),
    onKeyDown: handleKey,
    placeholder,
    className,
    autoComplete: 'off',
  }

  return (
    <div ref={wrapperRef} className="relative">
      {multiline ? (
        <textarea {...fieldProps} rows={1} className={`${className} resize-none overflow-hidden`} />
      ) : (
        <input type="text" {...fieldProps} />
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-56 overflow-auto">
          {filtered.map((s, idx) => (
            <li
              key={s}
              onMouseDown={(e) => { e.preventDefault(); accept(idx) }}
              onMouseEnter={() => setHoverIdx(idx)}
              className={`px-3 py-2 text-sm cursor-pointer ${
                idx === hoverIdx
                  ? 'bg-primary-soft text-primary'
                  : 'text-text hover:bg-surface-2'
              }`}
            >
              {s}
            </li>
          ))}
          <li className="px-3 py-1.5 text-xs text-faint border-t border-border bg-surface-2">
            ↑↓ navigate · Tab/Enter accept · Esc close
          </li>
        </ul>
      )}
    </div>
  )
}
