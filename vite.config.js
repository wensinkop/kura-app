import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'

// A build stamp (local date-time, e.g. "20260605-1747") computed once per build.
// It's shown in the app (Settings footer) so a test build can be identified on
// the device, and written to .build-id so the APK can be named to match. The
// official versionName/versionCode (for the Play Store) stay separate.
const d = new Date()
const p = (n) => String(n).padStart(2, '0')
const buildId = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
try {
  fs.writeFileSync(new URL('.build-id', import.meta.url), buildId)
} catch {
  // best-effort; the in-app stamp still works without the file
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  server: {
    watch: {
      // Don't watch the static design mockups in design/ — they're reference
      // material only, not part of the app build.
      ignored: ['**/design/**'],
    },
  },
})
