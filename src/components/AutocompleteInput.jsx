import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'

// Plain-text input with a typeahead dropdown. Ported from Gelato; restyled to
// Kura tokens. Suggestions are filtered case-insensitively by substring.
// - ↑/↓ navigate · Tab/Enter accept · Esc close · click/tap to accept
//
// Per the spec, suggestions appear from the 2nd typed character (minChars=2).
//
// Opt-in extras (used by the mobile bank-statement review flow):
// - multiline: render a textarea that auto-grows to fit its text (so a long note
//   is fully visible). In multiline mode Enter inserts a newline; Tab still
//   accepts the highlighted suggestion (and is otherwise swallowed so it never
//   inserts a tab character — there's no row-to-row Tab on mobile, the parent's
//   floating button handles that).
// - selectOnFocus: select all text on focus so typing replaces the note wholesale.
// - onFocus / onBlur: pass-throughs so the parent can track which note is active.
//
// Imperative handle (via ref): { focus, blur, scrollIntoView, acceptHighlighted }.
// acceptHighlighted() accepts the open suggestion if there is one and returns
// whether it did — the mobile "Tab" button uses this to accept-then-navigate.
const AutocompleteInput = forwardRef(function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  maxItems = 8,
  minChars = 2,
  multiline = false,
  selectOnFocus = false,
  onFocus,
  onBlur,
}, ref) {
  const [open, setOpen] = useState(false)
  const [hoverIdx, setHoverIdx] = useState(0)
  const wrapperRef = useRef(null)
  const elRef = useRef(null)

  const filtered = useMemo(() => {
    const q = (value ?? '').trim().toLowerCase()
    if (q.length < minChars) return []
    return (suggestions ?? [])
      .filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .slice(0, maxItems)
  }, [value, suggestions, maxItems, minChars])

  // Keep live values in refs so the (stable) imperative handle never goes stale.
  const liveRef = useRef({})
  liveRef.current = { open, filtered, hoverIdx, onChange }

  useImperativeHandle(ref, () => ({
    focus: () => elRef.current?.focus(),
    blur: () => elRef.current?.blur(),
    scrollIntoView: (opts) => elRef.current?.scrollIntoView(opts),
    acceptHighlighted: () => {
      const s = liveRef.current
      if (s.open && s.filtered.length > 0) {
        s.onChange(s.filtered[s.hoverIdx])
        setOpen(false)
        return true
      }
      return false
    },
  }), [])

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
    if (e.key === 'Tab') {
      if (open && filtered.length > 0) { e.preventDefault(); accept(hoverIdx) } // accept suggestion
      else if (multiline) e.preventDefault()                                    // don't insert a tab char
      return                                                                    // single-line, no suggestion → natural Tab
    }
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setHoverIdx((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setHoverIdx((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      if (!multiline) { e.preventDefault(); accept(hoverIdx) } // multiline Enter = newline
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function handleFocus(e) {
    setOpen(true)
    setHoverIdx(0)
    if (selectOnFocus) {
      const el = e.target
      requestAnimationFrame(() => { try { el.select() } catch { /* noop */ } })
    }
    onFocus?.(e)
  }

  const fieldProps = {
    ref: elRef,
    value,
    onChange: (e) => { onChange(e.target.value); setOpen(true); setHoverIdx(0) },
    onFocus: handleFocus,
    onBlur: (e) => onBlur?.(e),
    onKeyDown: handleKey,
    placeholder,
    autoComplete: 'off',
  }

  return (
    <div ref={wrapperRef} className="relative">
      {multiline ? (
        <textarea {...fieldProps} rows={1} className={`${className} resize-none overflow-hidden`} />
      ) : (
        <input type="text" {...fieldProps} className={className} />
      )}
      {open && filtered.length > 0 && (
        <ul className={`absolute z-30 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg overflow-auto ${multiline ? 'max-h-[9rem]' : 'max-h-56'}`}>
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
})

export default AutocompleteInput
