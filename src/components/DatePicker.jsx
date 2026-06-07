import { forwardRef, Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../AuthContext'

// Segmented date field. The native <input type=date> can't be forced into a
// chosen segment order (DD-MM-YYYY) — its order/format follow the OS locale — so
// for full control we render our own DD / MM / YYYY segments in the user's
// chosen order (Settings → Preferences → Date format; default DMY). Keyboard
// behaviour mirrors a native date field: tab in lands on the first segment,
// typing auto-advances, a high single digit completes a 2-digit segment (e.g. 4
// → day 04), Backspace at the start hops to the previous segment, arrows move
// between segments, and Tab leaves to the next control. A calendar button opens
// the OS picker for mouse/touch. Value in/out stays ISO 'YYYY-MM-DD'.
//
// Props: value ('YYYY-MM-DD' | ''), onChange (newValue) => void, min/max (ISO,
// applied to the calendar picker), className (the box styling, usually inputClass).

const SEG = {
  d: { len: 2, ph: 'DD', hi: 3, w: 'w-[2.4ch]' },   // hi: a first digit above this completes the segment
  m: { len: 2, ph: 'MM', hi: 1, w: 'w-[2.4ch]' },
  y: { len: 4, ph: 'YYYY', hi: null, w: 'w-[4.4ch]' },
}
const ORDER = { dmy: ['d', 'm', 'y'], mdy: ['m', 'd', 'y'], ymd: ['y', 'm', 'd'] }

function fromISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? { y: m[1], m: m[2], d: m[3] } : { y: '', m: '', d: '' }
}
function toISO(seg) {
  const { y, m, d } = seg
  if (y.length !== 4 || !m || !d) return null
  const mm = m.padStart(2, '0'), dd = d.padStart(2, '0')
  const mi = Number(mm), di = Number(dd)
  if (mi < 1 || mi > 12 || di < 1) return null
  const dim = new Date(Number(y), mi, 0).getDate() // days in that month/year
  if (di > dim) return null
  return `${y}-${mm}-${dd}`
}

function CalendarGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

const DatePicker = forwardRef(function DatePicker(
  { value, onChange, min, max, className, ...rest },
  forwardedRef
) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const order = ORDER[profile?.date_format ?? 'dmy'] ?? ORDER.dmy

  const [seg, setSeg] = useState(() => fromISO(value))
  const lastEmit = useRef(value ?? '')
  const refs = useRef({})
  const nativeRef = useRef(null)

  // Sync from the prop when it changes externally (calendar pick, row reset).
  useEffect(() => {
    if ((value ?? '') !== lastEmit.current) {
      setSeg(fromISO(value))
      lastEmit.current = value ?? ''
    }
  }, [value])

  function commit(next) {
    setSeg(next)
    const iso = toISO(next)
    if (iso) { lastEmit.current = iso; onChange(iso) }
    else if (!next.y && !next.m && !next.d) { lastEmit.current = ''; onChange('') }
  }

  const neighbour = (key, dir) => order[order.indexOf(key) + dir]
  function focusSeg(key) {
    const el = refs.current[key]
    if (el) { el.focus(); el.select() }
  }

  function onSegInput(key, raw) {
    const cfg = SEG[key]
    // Keep the LAST `len` digits so typing past a full segment rolls (e.g. typing
    // into a complete year 2023 then "6" shows 0236) rather than ignoring input.
    const digits = raw.replace(/\D/g, '').slice(-cfg.len)
    const next = { ...seg, [key]: digits }
    const early = cfg.len === 2 && digits.length === 1 && cfg.hi != null && Number(digits) > cfg.hi
    if (early) next[key] = digits.padStart(2, '0')
    commit(next)
    if (digits.length === cfg.len || early) {
      const nk = neighbour(key, 1)
      if (nk) focusSeg(nk)
    }
  }

  function onSegKeyDown(key, e) {
    const el = e.currentTarget
    if (e.key === 'Backspace' && !el.value) {
      const pk = neighbour(key, -1); if (pk) { e.preventDefault(); focusSeg(pk) }
    } else if (e.key === 'ArrowLeft' && el.selectionStart === 0) {
      const pk = neighbour(key, -1); if (pk) { e.preventDefault(); focusSeg(pk) }
    } else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length) {
      const nk = neighbour(key, 1); if (nk) { e.preventDefault(); focusSeg(nk) }
    }
  }

  const openPicker = () => { try { nativeRef.current?.showPicker?.() } catch { /* unsupported */ } }

  return (
    <div className={`relative flex items-center gap-0.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft ${className ?? ''}`}>
      {order.map((key, i) => (
        <Fragment key={key}>
          {i > 0 && <span className="text-faint select-none">-</span>}
          <input
            ref={(el) => { refs.current[key] = el }}
            value={seg[key]}
            onChange={(e) => onSegInput(key, e.target.value)}
            onKeyDown={(e) => onSegKeyDown(key, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            placeholder={SEG[key].ph}
            aria-label={SEG[key].ph}
            className={`${SEG[key].w} bg-transparent text-center tabular outline-none rounded px-0.5 focus:bg-primary-soft focus:text-primary placeholder:text-faint`}
            {...(i === 0 ? rest : {})}
          />
        </Fragment>
      ))}
      <button type="button" tabIndex={-1} onClick={openPicker} aria-label={t('common.openCalendar')}
        className="ml-auto pl-1.5 text-muted hover:text-primary shrink-0">
        <CalendarGlyph />
      </button>
      {/* Hidden native input drives the OS calendar via showPicker(); kept rendered
          (not display:none) so showPicker is allowed. */}
      <input
        ref={(el) => {
          nativeRef.current = el
          if (typeof forwardedRef === 'function') forwardedRef(el)
          else if (forwardedRef) forwardedRef.current = el
        }}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => { const v = e.target.value; lastEmit.current = v; setSeg(fromISO(v)); onChange(v) }}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute bottom-0 left-3 w-px h-px opacity-0 pointer-events-none"
      />
    </div>
  )
})

export default DatePicker
