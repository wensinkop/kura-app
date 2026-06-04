import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

// Combobox: type-or-click select with a filtered, optionally grouped dropdown
// and keyboard nav (↑/↓ move · Enter/Tab commit · Esc cancel).
// Ported from Gelato; restyled to Kura tokens. Serves Kura's category /
// sub-category picker and the grouped-account picker.
//
// Props:
//   value     — selected option's `value` (string)
//   onChange  — (newValue) => void
//   options   — array of { value, label, group? }   (group = optional section header)
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '— select —',
  className,
  onCreate,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [creating, setCreating] = useState(false)
  const wrapperRef = useRef(null)

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  // Offer to create when a name is typed that doesn't already exist.
  const trimmed = query.trim()
  const canCreate =
    !!onCreate && trimmed.length > 0 && !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      const v = await onCreate(trimmed)
      if (v != null) commit(v)
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    function onDocClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function commit(val) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      // Tab without typing anything keeps the current value (so tabbing through a
      // pre-filled field — e.g. an inherited account — doesn't replace it with
      // the top option). Enter, or Tab after typing, commits the match.
      if (e.key === 'Tab' && !query.trim()) {
        setOpen(false)
      } else if (open && filtered[highlight]) {
        if (e.key === 'Enter') e.preventDefault()
        commit(filtered[highlight].value)
      } else if (open && canCreate) {
        if (e.key === 'Enter') e.preventDefault()
        handleCreate()
      }
    } else if (e.key === 'Escape') {
      setOpen(false); setQuery('')
    }
  }

  const groups = useMemo(() => {
    const m = new Map()
    for (const o of filtered) {
      const k = o.group ?? ''
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(o)
    }
    return Array.from(m.entries())
  }, [filtered])

  const inputValue = open ? query : (selected?.label ?? '')

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => { setOpen(true); setQuery(''); setHighlight(0) }}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-30 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-60 overflow-auto">
          {filtered.length === 0 && !canCreate ? (
            <li className="px-3 py-2 text-sm text-muted italic">No matches</li>
          ) : (
            groups.map(([groupKey, items]) => (
              <Fragment key={groupKey || '__nogroup'}>
                {groupKey && (
                  <li className="px-3 py-1.5 text-xs font-semibold uppercase text-faint bg-surface-2 tracking-wide">
                    {groupKey}
                  </li>
                )}
                {items.map((o) => {
                  const idx = filtered.indexOf(o)
                  const isActive = idx === highlight
                  return (
                    <li
                      key={o.value}
                      onMouseDown={(e) => { e.preventDefault(); commit(o.value) }}
                      onMouseEnter={() => setHighlight(idx)}
                      className={`px-3 py-2 text-sm cursor-pointer ${
                        isActive ? 'bg-primary-soft text-primary' : 'text-text hover:bg-surface-2'
                      }`}
                    >
                      {o.label}
                    </li>
                  )
                })}
              </Fragment>
            ))
          )}
          {canCreate && (
            <li
              onMouseDown={(e) => { e.preventDefault(); handleCreate() }}
              className="px-3 py-2 text-sm cursor-pointer text-primary hover:bg-surface-2 border-t border-border first:border-t-0"
            >
              {creating ? 'Creating…' : `＋ Create “${trimmed}”`}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
