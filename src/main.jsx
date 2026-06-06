import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'
import { setupNativeKeyboard } from './lib/nativeKeyboard'

setupNativeKeyboard()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker is for the web PWA only. Inside the Capacitor native shell the
// app's assets are already served locally, and a SW cache layer there only pins
// stale builds across app updates — so natively we skip registration and clear
// any SW a previous web visit may have left behind.
if (Capacitor.isNativePlatform()) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {})
  }
} else if ('serviceWorker' in navigator) {
  // Registered after load so it never blocks first paint.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err)
    })
  })
}
