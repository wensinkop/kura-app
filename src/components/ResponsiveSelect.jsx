import { forwardRef } from 'react'
import SearchableSelect from './SearchableSelect'
import MobileSelect from './MobileSelect'
import { inputClass } from './ui'

// One select that adapts: bottom-sheet picker on mobile (no keyboard, never
// covered), type-to-search on desktop. Shared by the entry and edit screens.
// A forwarded ref reaches the mobile picker's imperative handle (open()), so
// callers can pop the sheet open automatically (e.g. sub-category after a
// category with children is chosen).
const ResponsiveSelect = forwardRef(function ResponsiveSelect(
  { title, placeholder, value, onChange, options, noneLabel },
  ref
) {
  return (
    <>
      <div className="desk:hidden">
        <MobileSelect ref={ref} title={title} placeholder={placeholder} noneLabel={noneLabel}
          value={value} onChange={onChange} options={options} />
      </div>
      <div className="hidden desk:block">
        <SearchableSelect value={value} onChange={onChange} options={options} className={inputClass} placeholder={placeholder} />
      </div>
    </>
  )
})

export default ResponsiveSelect
