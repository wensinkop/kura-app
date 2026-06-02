import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const FilterContext = createContext({})
const KEY = 'kura.accountFilter'

// Account filter: a Set of selected account ids. An EMPTY set means "no filter"
// (show every account). Lives above the routed pages and is persisted to
// localStorage, so the choice survives both month navigation and reloads
// (Session 0 §3: the filter persists across month navigation).
export function FilterProvider({ children }) {
  const [ids, setIds] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...ids]))
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [ids])

  const value = useMemo(
    () => ({
      accountIds: ids,
      isFiltered: ids.size > 0,
      setAccountIds: (next) => setIds(new Set(next)),
      clear: () => setIds(new Set()),
    }),
    [ids]
  )

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useAccountFilter() {
  return useContext(FilterContext)
}

// Does a transaction belong to the selected accounts? An empty filter matches
// everything. A transfer matches if EITHER leg is on a selected account.
// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with the context it serves
export function matchesAccountFilter(t, ids) {
  if (!ids || ids.size === 0) return true
  if (ids.has(t.account_id)) return true
  if (t.kind === 'transfer' && ids.has(t.to_account_id)) return true
  return false
}
