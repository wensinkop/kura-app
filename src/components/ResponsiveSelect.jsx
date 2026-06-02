import SearchableSelect from './SearchableSelect'
import MobileSelect from './MobileSelect'
import { inputClass } from './ui'

// One select that adapts: bottom-sheet picker on mobile (no keyboard, never
// covered), type-to-search on desktop. Shared by the entry and edit screens.
export default function ResponsiveSelect({ title, placeholder, value, onChange, options, noneLabel }) {
  return (
    <>
      <div className="desk:hidden">
        <MobileSelect title={title} placeholder={placeholder} noneLabel={noneLabel}
          value={value} onChange={onChange} options={options} />
      </div>
      <div className="hidden desk:block">
        <SearchableSelect value={value} onChange={onChange} options={options} className={inputClass} placeholder={placeholder} />
      </div>
    </>
  )
}
