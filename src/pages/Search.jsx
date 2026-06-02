import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchTransactions, listCategories } from '../lib/data'
import { dayLabel } from '../lib/format'
import TxRowContent from '../components/TxRowContent'
import { ChevronLeft, SearchIcon, CloseIcon } from '../lib/icons'

// Full-screen all-time note search (outside the app shell, like /new). Typeahead
// from the 2nd character; substring match with the hit highlighted; tapping a
// result opens the existing /tx/:id edit page.
export default function Search() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [catMap, setCatMap] = useState(new Map())
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    listCategories().then(({ data, error }) => {
      if (!error) setCatMap(new Map((data ?? []).map((c) => [c.id, c])))
    })
    inputRef.current?.focus()
  }, [])

  // Debounced search; needs ≥ 2 characters (spec: suggest from the 2nd char).
  // All setState runs inside the timeout callback (not synchronously in the
  // effect body) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      const id = setTimeout(() => { setResults([]); setSearched(false); setLoading(false) }, 0)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setLoading(true)
      searchTransactions(term).then(({ data, error }) => {
        if (!error) setResults(data ?? [])
        setSearched(true)
        setLoading(false)
      })
    }, 250)
    return () => clearTimeout(id)
  }, [q])

  // Group results by date (newest first; query already orders by date desc).
  const groups = []
  const byDate = new Map()
  for (const t of results) {
    if (!byDate.has(t.date)) {
      byDate.set(t.date, [])
      groups.push(t.date)
    }
    byDate.get(t.date).push(t)
  }

  const term = q.trim()

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="sticky top-0 z-20 bg-surface border-b border-border px-3 py-2.5 flex items-center gap-2 w-full max-w-[760px] mx-auto">
        <button onClick={() => navigate(-1)} aria-label="Back"
          className="w-9 h-9 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2 shrink-0">
          <ChevronLeft />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft">
          <SearchIcon className="w-[18px] h-[18px] text-faint shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            className="flex-1 bg-transparent py-2.5 text-[15px] text-text placeholder:text-faint focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear"
              className="w-7 h-7 -mr-1 rounded-full grid place-items-center text-muted hover:bg-surface">
              <CloseIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 pb-16 pt-4 w-full max-w-[760px] mx-auto">
        {term.length < 2 ? (
          <p className="text-sm text-muted text-center py-10">Type at least 2 characters to search your transactions.</p>
        ) : loading ? (
          <p className="text-sm text-muted text-center py-10">Searching…</p>
        ) : results.length === 0 && searched ? (
          <p className="text-sm text-muted text-center py-10">No transactions match “{term}”.</p>
        ) : (
          groups.map((date) => (
            <div key={date} className="mb-3.5">
              <div className="text-[11px] font-bold text-faint px-1 pb-1.5">{dayLabel(date)}</div>
              <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
                {byDate.get(date).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/tx/${t.id}`)}
                    className="w-full flex gap-3 px-3.5 py-2.5 border-t border-border first:border-t-0 hover:bg-surface-2 text-left"
                  >
                    <TxRowContent t={t} catMap={catMap} highlight={term} />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
