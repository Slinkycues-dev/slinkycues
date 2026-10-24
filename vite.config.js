import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Served at slinkycues.vercel.app/diary through the Slinkycues hub, so every asset
// URL is prefixed. Runtime fetches use import.meta.env.BASE_URL for the same reason.
export default defineConfig({
  base: '/diary/',
  plugins: [react()],
})
