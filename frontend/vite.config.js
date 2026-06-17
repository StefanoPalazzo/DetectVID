// vite.config.js
// Build configuration for the DetectVID web app.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'react'
          if (id.includes('leaflet') || id.includes('@geoman-io')) return 'maps'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('date-fns') || id.includes('exifr') || id.includes('lucide-react') || id.includes('clsx')) return 'utils'
          return 'vendor'
        },
      },
    },
  },
})
