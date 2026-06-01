import { useEffect, useMemo, useRef, useState } from 'react'

// Plain-text input with a typeahead dropdown. Ported from Gelato; restyled to
// Kura tokens. Suggestions are filtered case-insensitively by substring.
// - ↑/↓ navigate · Tab/Enter accept · Esc close · click/tap to accept
//
// Per the spec, suggestions appear from the 2nd typed character (minChars=2).
export default function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  maxItems = 8,
  minChars = 2,
}) {
  const [open, setOpen] = useState(false)
  const [hoverIdx, setHoverIdx] = useState(0)
  const wrapperRef = useRef(null)

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
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault(); accept(hoverIdx)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHoverIdx(0) }}
        onFocus={() => { setOpen(true); setHoverIdx(0) }}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
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
