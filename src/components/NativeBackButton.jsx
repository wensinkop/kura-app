import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'

// Wires Android's hardware/gesture back button to the app's router.
//
// Without this, the native shell's default back behaviour is to close the app
// on every press. Instead we walk back through the in-app history, and only
// when the user is already on Home (with nowhere left to go) do we ask for a
// second press to confirm exit. Renders nothing on web (the listener is only
// attached inside the Capacitor native shell).
export default function NativeBackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showExit, setShowExit] = useState(false)
  const lastBack = useRef(0)

  // The native listener is registered once; keep the current path in a ref so
  // the handler always sees the latest route without re-subscribing.
  const pathRef = useRef(location.pathname)
  useEffect(() => {
    pathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle
    let exitTimer
    CapApp.addListener('backButton', ({ canGoBack }) => {
      const path = pathRef.current
      if (path !== '/') {
        // Not on Home: step back through history, or fall back to Home if this
        // was the first screen (so back never unexpectedly closes the app).
        if (canGoBack || window.history.length > 1) navigate(-1)
        else navigate('/')
        return
      }
      // On Home: require a second press within 2s to actually exit.
      const now = Date.now()
      if (now - lastBack.current < 2000) {
        CapApp.exitApp()
      } else {
        lastBack.current = now
        setShowExit(true)
        clearTimeout(exitTimer)
        exitTimer = setTimeout(() => setShowExit(false), 2000)
      }
    }).then((h) => {
      handle = h
    })
    return () => {
      clearTimeout(exitTimer)
      if (handle) handle.remove()
    }
  }, [navigate])

  if (!showExit) return null
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[100] bg-text text-bg text-sm font-medium px-4 py-2 rounded-full shadow-lg pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
    >
      Press back again to exit
    </div>
  )
}
