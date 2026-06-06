import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

// On native Android the WebView resizes to sit above the soft keyboard (which
// keeps the focused field visible). A side effect is that the entry Save bar,
// pinned to the bottom of the now-shorter viewport, ends up floating directly
// above the keyboard. We don't want that, so we toggle a `keyboard-open` class on
// <html> from the native keyboard show/hide events; CSS then hides such bottom
// bars while the keyboard is up — they reappear when it closes. No-op on web.
export function setupNativeKeyboard() {
  if (!Capacitor.isNativePlatform()) return
  const root = document.documentElement
  const open = () => root.classList.add('keyboard-open')
  const close = () => root.classList.remove('keyboard-open')
  Keyboard.addListener('keyboardWillShow', open)
  Keyboard.addListener('keyboardDidShow', open)
  Keyboard.addListener('keyboardWillHide', close)
  Keyboard.addListener('keyboardDidHide', close)
}
