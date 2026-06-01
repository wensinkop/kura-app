import { forwardRef } from 'react'

// Native date input wrapper. Gives the OS/browser date UX: tab through the
// DD / MM / YYYY segments, type to replace each, plus the built-in calendar.
// Value in/out is ISO 'YYYY-MM-DD' (the native value format). Display ordering
// (DD/MM/YYYY) follows the browser/OS locale. Ported from Gelato unchanged;
// styling is supplied by the caller via `className`.
//
// Props:
//   value     — 'YYYY-MM-DD' or '' (controlled)
//   onChange  — (newValue) => void
//   min / max — optional ISO bounds
const DatePicker = forwardRef(function DatePicker(
  { value, onChange, min, max, className, ...rest },
  forwardedRef
) {
  return (
    <input
      ref={forwardedRef}
      type="date"
      value={value || ''}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      {...rest}
    />
  )
})

export default DatePicker
