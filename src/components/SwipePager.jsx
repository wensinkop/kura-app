import { useEffect, useRef } from 'react'

// Finger-following period pager (mobile). The wrapped content tracks the finger
// horizontally as you drag — like swiping a card — then, past a threshold, flies
// off in that direction while the new period's content slides in from the other
// side. A short drag springs back. Only this panel moves; the page header and
// bottom nav stay put because they live outside it.
//
// Touch handling is on `document` (so the whole screen is draggable, even below
// a short list) but the transform is applied directly to the panel via a ref,
// so dragging doesn't re-render React on every move. `touch-action` isn't
// needed: we only block the page's vertical scroll (preventDefault) once a
// gesture is locked horizontal, so vertical scrolling stays native and smooth.
//
// Props:
//   enabled  — turn the gesture on/off (e.g. off in a custom date range)
//   onPrev   — go to the previous period (called when you swipe right)
//   onNext   — go to the next period (called when you swipe left)
//   className — classes for the moving panel
export default function SwipePager({ enabled = true, onPrev, onNext, className = '', children }) {
  const panelRef = useRef(null)
  const cfg = useRef({ enabled, onPrev, onNext })
  useEffect(() => {
    cfg.current = { enabled, onPrev, onNext }
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    let sx = 0, sy = 0, dragging = false, locked = null, width = 0, animating = false

    const apply = (x, animate) => {
      panel.style.transition = animate ? 'transform .22s ease-out, opacity .22s ease-out' : 'none'
      panel.style.transform = x ? `translateX(${x}px)` : 'translateX(0)'
      panel.style.opacity = String(Math.max(1 - Math.abs(x) / ((width || 600) * 1.7), 0.35))
    }

    const onStart = (e) => {
      if (!cfg.current.enabled || animating || e.touches.length !== 1) { dragging = false; return }
      sx = e.touches[0].clientX
      sy = e.touches[0].clientY
      width = panel.offsetWidth || window.innerWidth
      dragging = true
      locked = null
    }

    const onMove = (e) => {
      if (!dragging || !cfg.current.enabled || e.touches.length !== 1) return
      const dx = e.touches[0].clientX - sx
      const dy = e.touches[0].clientY - sy
      if (locked === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (locked !== 'h') return
      e.preventDefault() // hold the page still while swiping the card sideways
      apply(dx, false)
    }

    const onEnd = (e) => {
      if (!dragging) return
      dragging = false
      if (locked !== 'h') return
      const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sx) - sx
      const threshold = Math.max(width * 0.22, 56)
      if (Math.abs(dx) < threshold) {
        apply(0, true) // not far enough — spring back
        return
      }
      const next = dx < 0
      animating = true
      apply(next ? -width * 1.1 : width * 1.1, true) // fly the card off
      const done = (ev) => {
        if (ev.propertyName !== 'transform') return
        panel.removeEventListener('transitionend', done)
        if (next) cfg.current.onNext?.()
        else cfg.current.onPrev?.()
        // New period content starts off the opposite edge, then slides to centre.
        apply(next ? width : -width, false)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          apply(0, true)
          animating = false
        }))
      }
      panel.addEventListener('transitionend', done)
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return (
    <div ref={panelRef} className={className} style={{ willChange: 'transform' }}>
      {children}
    </div>
  )
}
