import { forwardRef, useRef } from 'react'
import { useAuth } from '../AuthContext'
import { formatDate } from '../lib/format'

// Date field that shows the date in the user's chosen order (Settings →
// Preferences → Date format; default DD-MM-YYYY) while still using the native
// OS date picker for input. The native <input type=date> is layered
// transparently over a styled display box: tapping anywhere opens the device
// calendar (showPicker), and the value renders in our format. The native
// control's own collapsed format is locale-controlled and can't be set from the
// web — hence the overlay. Value in/out stays ISO 'YYYY-MM-DD'.
//
// Props: value ('YYYY-MM-DD' | ''), onChange (newValue) => void, min/max (ISO),
// className (the box styling, usually inputClass).
const DatePicker = forwardRef(function DatePicker(
  { value, onChange, min, max, className, ...rest },
  forwardedRef
) {
  const { profile } = useAuth()
  const fmt = profile?.date_format ?? 'dmy'
  const display = formatDate(value, fmt)

  const innerRef = useRef(null)
  const setRefs = (el) => {
    innerRef.current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }
  const openPicker = () => {
    try { innerRef.current?.showPicker?.() } catch { /* unsupported / needs gesture */ }
  }

  return (
    <div
      onClick={openPicker}
      className={`relative flex items-center cursor-pointer focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft ${className ?? ''}`}
    >
      <span className={display ? 'text-text' : 'text-faint'}>{display || 'Pick a date'}</span>
      <input
        ref={setRefs}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Date"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus:outline-none"
        {...rest}
      />
    </div>
  )
})

export default DatePicker
