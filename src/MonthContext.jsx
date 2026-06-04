import { createContext, useContext, useMemo, useState } from 'react'

const MonthContext = createContext({})

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Shared selected-month state so the header MonthNav and the Home page stay in
// sync. Provided inside AppShell (wraps both the header and the routed Outlet).
// `new Date()` for the initial month only — fine at render time.
export function MonthProvider({ children }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [monthIndex, setMonthIndex] = useState(now.getMonth())

  function shift(delta) {
    setMonthIndex((m) => {
      let nm = m + delta
      let ny = year
      if (nm > 11) { nm = 0; ny++ }
      if (nm < 0) { nm = 11; ny-- }
      if (ny !== year) setYear(ny)
      return nm
    })
  }

  // Jump straight back to the month that contains today.
  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonthIndex(t.getMonth())
  }

  const value = useMemo(
    () => {
      const t = new Date()
      return {
        year, monthIndex, label: `${MONTHS[monthIndex]} ${year}`,
        prev: () => shift(-1), next: () => shift(1),
        today: goToday,
        isCurrent: year === t.getFullYear() && monthIndex === t.getMonth(),
      }
    },
    // shift closes over `year`; recreate when month/year change.
    [year, monthIndex] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useMonth() {
  return useContext(MonthContext)
}
