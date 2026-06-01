import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // Don't watch the static design mockups in design/ — they're reference
      // material only, not part of the app build.
      ignored: ['**/design/**'],
    },
  },
})
